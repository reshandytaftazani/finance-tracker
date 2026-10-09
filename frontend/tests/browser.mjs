// Dependency-free browser regression: real Chrome + Vite + migrated SQLite API.
// Requires Chrome/Chromium and the existing backend Python environment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = await mkdtemp(resolve(process.env.TEST_ARTIFACTS_DIR || tmpdir(), "finance-ui-"));
const python = process.env.BACKEND_PYTHON || resolve(root, "../backend/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const chrome = process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome");
const apiPort = Number(process.env.TEST_API_PORT || 18032);
const uiPort = Number(process.env.TEST_UI_PORT || 15132);
const api = `http://127.0.0.1:${apiPort}`;
const ui = `http://127.0.0.1:${uiPort}`;
const children = [];
let socket;

function start(command, args, env = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  child.on("error", (error) => { log += error.message; });
  child.log = () => log;
  return child;
}

async function until(check, description, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await check()) return; } catch { /* process/page still starting */ }
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

try {
  // Refuse occupied ports before any fixture writes or browser API requests;
  // never treat a pre-existing personal backend as this test's server.
  const reservations = [];
  try {
    for (const port of [apiPort, uiPort]) {
      const server = createServer();
      await new Promise((yes, no) => { server.once("error", no); server.listen(port, "127.0.0.1", yes); });
      reservations.push(server);
    }
  } finally {
    await Promise.all(reservations.map((server) => new Promise((yes) => server.close(yes))));
  }
  start(python, [resolve(root, "tests/browser-server.py")], {
    APP_DATABASE_URL: `sqlite:///${resolve(artifacts, "test.db").replaceAll("\\", "/")}`,
    APP_ENV: "local", APP_PORT: String(apiPort), APP_FRONTEND_ORIGIN: ui,
  });
  start(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"], { VITE_API_BASE_URL: api });
  await until(async () => (await fetch(`${api}/health`)).ok && (await fetch(ui)).ok, "test servers");
  start(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${resolve(artifacts, "chrome")}`, "about:blank"]);
  let debugPort;
  await until(async () => {
    debugPort = (await readFile(resolve(artifacts, "chrome/DevToolsActivePort"), "utf8")).split("\n")[0];
    return debugPort;
  }, "Chrome debugger");
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((yes, no) => { socket.addEventListener("open", yes, { once: true }); socket.addEventListener("error", no, { once: true }); });
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails.text);
  });
  function send(method, params = {}) {
    return new Promise((yes, no) => {
      const next = ++id;
      const timer = setTimeout(() => { pending.delete(next); no(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(next, { resolve: (value) => { clearTimeout(timer); yes(value); }, reject: (error) => { clearTimeout(timer); no(error); } });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  const text = () => evaluate("document.body.innerText");
  const waitText = (value) => until(async () => (await text()).includes(value), value);
  const click = (label) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)}); if (!button || button.disabled) throw new Error('Button missing/disabled: ' + ${JSON.stringify(label)}); button.focus(); button.click(); })()`);
  async function fill(name, value) {
    await evaluate(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) throw new Error('Missing field ${name}'); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  }
  async function apiRequest(path, method = "GET", payload) {
    const response = await fetch(`${api}/api/v1${path}`, { method, headers: { "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    assert.ok(response.ok, `API ${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  async function capture(name, width, height) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(150);
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false, `page overflow at ${width}px`);
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(resolve(artifacts, name), Buffer.from(shot.data, "base64"));
  }
  await send("Runtime.enable");
  await send("Page.enable");
  // Freeze the browser calendar only. API fixtures and every page reload share
  // the same date regardless of when this regression is run.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "{ const RealDate = Date; window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-10-09T05:00:00Z'])); } static now() { return new RealDate('2026-10-09T05:00:00Z').getTime(); } }; }" });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${ui}/transactions` });
  await waitText("Tidak ada transaksi");
  await click("Tambah Transaksi");
  await waitText("Nominal (Rp)");
  await click("Simpan transaksi");
  await waitText("Pilih kategori");
  assert.equal(await evaluate("document.activeElement.name"), "category_id");
  const categories = (await apiRequest("/categories?page_size=100")).items;
  const food = categories.find((item) => item.name === "Makanan").id;
  const salary = categories.find((item) => item.name === "Gaji").id;
  await fill("date", "2026-10-09");
  await fill("category_id", String(food));
  await fill("amount_rupiah", "0");
  await click("Simpan transaksi");
  assert.ok(await evaluate("document.querySelector('[name=amount_rupiah]').getAttribute('aria-invalid') === 'true'"));
  for (const [description, amount] of [["UI satu", "9999999999999"], ["UI dua", "2"], ["UI tiga", "3"]]) {
    if (!(await evaluate("Boolean(document.querySelector('[name=date]'))"))) await click("Tambah Transaksi");
    await fill("date", "2026-10-09");
    await fill("category_id", String(food));
    await fill("amount_rupiah", amount);
    await fill("description", description);
    await click("Simpan transaksi");
    await until(async () => !(await evaluate("Boolean(document.querySelector('[name=date]'))")), "form closes after create");
    await until(async () => await evaluate("document.activeElement.textContent.trim() === 'Tambah Transaksi'"), "focus returns to add after save");
  }
  await fill("filter-month", "2026-10");
  await waitText("UI satu");
  assert.equal((await apiRequest("/transactions")).total, 3);
  assert.ok((await text()).includes("9.999.999.999.999"));
  console.log("PASS create 3, inline validation, exact large amount, list refetch");

  const rows = () => evaluate("[...document.querySelectorAll('tbody tr')].map(row => row.innerText)");

  // Read the real downloaded file, not a stubbed anchor or mock Blob.
  const downloads = resolve(artifacts, "downloads");
  await mkdir(downloads);
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await click("Export CSV");
  const download = resolve(downloads, "transaksi-2026-10.csv");
  await until(async () => (await readFile(download)).length > 0, "CSV download");
  const initialCSV = await readFile(download, "utf8");
  assert.ok(initialCSV.startsWith('\ufeff"tanggal","tipe","kategori","nominal_rupiah","deskripsi"'));
  assert.ok(initialCSV.includes('"9999999999999","UI satu"'));
  assert.equal(initialCSV.trimEnd().split("\r\n").length, 4);
  assert.ok((await text()).includes("Download CSV dimulai"));
  console.log("PASS real UTF-8 CSV download with exact amount");
  await evaluate("{ const button = [...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes('UI satu')).querySelector('button'); button.focus(); button.click(); }");
  await fill("type", "income");
  assert.equal(await evaluate("document.querySelector('[name=category_id]').value"), "");
  assert.equal(await evaluate(`Boolean(document.querySelector('[name=category_id] option[value="${food}"]'))`), false);
  await fill("category_id", String(salary));
  await fill("date", "2026-09-30");
  await fill("description", "UI pindah");
  await click("Simpan perubahan");
  await until(async () => !(await text()).includes("UI satu"), "edited row leaves month filter");
  await until(async () => await evaluate("document.activeElement.textContent.trim() === 'Tambah Transaksi'"), "focus returns to fallback after edit moves row");
  await fill("filter-month", "2026-09");
  await waitText("UI pindah");
  await fill("filter-type", "expense");
  await waitText("Tidak ada transaksi");
  await fill("filter-type", "income");
  await fill("filter-category", String(salary));
  await waitText("UI pindah");
  console.log("PASS edit date/type/category, dependent category reset, combined filters");
  await click("Export CSV");
  const filteredDownload = resolve(downloads, "transaksi-2026-09.csv");
  await until(async () => (await readFile(filteredDownload)).length > 0, "filtered CSV download");
  assert.equal(await readFile(filteredDownload, "utf8"), '\ufeff"tanggal","tipe","kategori","nominal_rupiah","deskripsi"\r\n"2026-09-30","income","Gaji","9999999999999","UI pindah"\r\n');
  console.log("PASS downloaded CSV matches combined month/type/category filter");

  await fill("filter-month", "2026-10");
  await fill("filter-type", "all");
  await fill("filter-category", "all");
  await waitText("UI dua");
  await evaluate("{ const button = [...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes('UI dua')).querySelectorAll('button')[1]; button.focus(); button.click(); }");
  await waitText("Hapus transaksi?");
  await click("Batal");
  await until(async () => await evaluate("document.activeElement.getAttribute('aria-label') === 'Hapus transaksi UI dua'"), "focus returns after delete cancel");
  assert.equal((await apiRequest("/transactions")).total, 3);
  await evaluate("{ const button = [...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes('UI dua')).querySelectorAll('button')[1]; button.focus(); button.click(); }");
  await click("Hapus transaksi");
  await until(async () => !(await text()).includes("UI dua"), "deleted row removed");
  await until(async () => await evaluate("document.activeElement.textContent.trim() === 'Tambah Transaksi'"), "focus fallback after delete");
  await send("Page.reload");
  await waitText("UI tiga");
  assert.equal((await apiRequest("/transactions")).total, 2);
  console.log("PASS delete cancel/confirm, persistence after browser reload");

  // Fill enough rows to exercise deep page navigation and reset-on-filter.
  for (let i = 0; i < 21; i++) await apiRequest("/transactions", "POST", { category_id: food, type: "expense", amount_rupiah: "1", date: "2026-10-08", description: `Page ${i}` });
  await send("Page.reload");
  await waitText("Halaman 1 dari 2");
  await click("Berikutnya");
  await waitText("Halaman 2 dari 2");
  // Remove only our first test download so this file must be freshly created.
  const { unlink } = await import("node:fs/promises");
  await unlink(download);
  await click("Export CSV");
  await until(async () => (await readFile(download)).length > 0, "all-pages CSV download");
  assert.equal((await readFile(download, "utf8")).trimEnd().split("\r\n").length, 23);
  console.log("PASS export includes all 22 matches while UI is on page 2");
  await fill("filter-category", String(salary));
  await waitText("Tidak ada transaksi");
  await fill("filter-category", "all");
  await waitText("Halaman 1 dari 2");
  assert.equal((await rows()).length, 20);
  console.log("PASS pagination and reset on filter change");

  await click("Berikutnya");
  await waitText("Halaman 2 dari 2");
  for (let i = 0; i < 2; i++) {
    await evaluate("document.querySelector('tbody tr').querySelectorAll('button')[1].click()");
    await click("Hapus transaksi");
    await until(async () => !(await evaluate("Boolean(document.querySelector('dialog'))")), "delete closes dialog");
  }
  await waitText("Halaman 1 dari 1");
  assert.equal((await rows()).length, 20);
  console.log("PASS deleting final row of last page returns to a populated page");

  // Fault only the transport; React/form/API clients remain real.
  await evaluate("window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/api/v1/transactions') ? Promise.reject(new TypeError('offline')) : window.realFetch(...args)");
  await fill("filter-month", "2026-08");
  await waitText("Tidak dapat terhubung");
  assert.equal((await text()).includes("Tidak ada transaksi"), false);
  await evaluate("window.fetch = window.realFetch");
  await click("Coba lagi");
  await waitText("Tidak ada transaksi");
  console.log("PASS fetch error is not empty; retry recovers");

  await click("Tambah Transaksi");
  await fill("date", "2026-10-09");
  await fill("category_id", String(food));
  await fill("amount_rupiah", "456");
  await fill("description", "Fault-safe draft");
  await evaluate("window.fetch = (...args) => args[1]?.method === 'POST' ? Promise.resolve(new Response(JSON.stringify({detail:[{loc:['body','amount_rupiah'],msg:'Invalid',type:'value_error'}]}),{status:422,headers:{'Content-Type':'application/json'}})) : window.realFetch(...args)");
  await click("Simpan transaksi");
  await waitText("Nominal ditolak server");
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), "Fault-safe draft");
  assert.equal(await evaluate("document.activeElement.name"), "amount_rupiah");
  await evaluate("window.fetch = (...args) => args[1]?.method === 'POST' ? Promise.reject(new TypeError('offline')) : window.realFetch(...args)");
  await click("Simpan transaksi");
  await waitText("Tidak dapat terhubung");
  assert.equal(await evaluate("document.querySelector('[name=amount_rupiah]').value"), "456");
  const beforeSubmit = (await apiRequest("/transactions")).total;
  await evaluate("window.fetch = (...args) => args[1]?.method === 'POST' ? new Promise((yes,no) => setTimeout(() => window.realFetch(...args).then(yes,no),500)) : window.realFetch(...args); document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit()");
  await waitText("Menyimpan…");
  assert.equal(await evaluate("document.querySelector('[type=submit]').disabled"), true);
  await until(async () => !(await evaluate("Boolean(document.querySelector('[name=date]'))")), "one successful submit");
  assert.equal((await apiRequest("/transactions")).total, beforeSubmit + 1);
  await evaluate("window.fetch = window.realFetch");
  console.log("PASS server inline errors, failed-save draft retention, submitting and double-submit guard");

  await fill("filter-month", "2026-10");
  await waitText("Fault-safe draft");
  await evaluate("[...document.querySelectorAll('tbody tr')].find(row => row.innerText.includes('Fault-safe draft')).querySelectorAll('button')[1].click()");
  await evaluate("window.fetch = (...args) => args[1]?.method === 'DELETE' ? Promise.resolve(new Response('{}',{status:409})) : window.realFetch(...args)");
  await click("Hapus transaksi");
  await waitText("konflik data");
  assert.equal((await apiRequest("/transactions")).total, beforeSubmit + 1);
  await evaluate("window.fetch = window.realFetch");
  await click("Hapus transaksi");
  await until(async () => !(await evaluate("Boolean(document.querySelector('dialog'))")), "delete retry closes dialog");
  console.log("PASS delete error retains row and confirmation; retry succeeds");

  const categoryFault = await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/api/v1/categories') ? Promise.reject(new TypeError('offline categories')) : new Promise((yes,no) => setTimeout(() => window.realFetch(...args).then(yes,no),400));" });
  await send("Page.reload");
  await waitText("Memuat transaksi");
  await waitText("Kategori gagal dimuat");
  await click("Tambah Transaksi");
  assert.equal(await evaluate("document.querySelector('[type=submit]').disabled"), true);
  await fill("description", "Retained while categories fail");
  await evaluate("window.fetch = window.realFetch");
  await click("Coba lagi kategori");
  await until(async () => !(await evaluate("document.querySelector('[type=submit]').disabled")), "category retry enables form");
  assert.equal(await evaluate("document.querySelector('[name=description]').value"), "Retained while categories fail");
  await click("Batal");
  console.log("PASS loading and category error/retry, retained form, disabled submit without categories");

  await fill("filter-month", "2026-10");
  await waitText("UI tiga");
  await evaluate("window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/export/csv') ? Promise.reject(new TypeError('offline export')) : window.realFetch(...args)");
  await click("Export CSV");
  await waitText("Export CSV gagal");
  assert.equal(await evaluate("document.querySelectorAll('a[download]').length"), 0);
  await capture("mobile-export-error.png", 390, 844);
  // Delay only the export transport to check pending state and double-click guard.
  await evaluate("window.exportRequests = 0; window.fetch = (...args) => { if (!String(args[0]).includes('/export/csv')) return window.realFetch(...args); window.exportRequests++; return new Promise((yes,no) => setTimeout(() => window.realFetch(...args).then(yes,no),500)); }");
  await evaluate("{ const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Coba lagi export'); button.click(); button.click(); }");
  await waitText("Mengekspor…");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Mengekspor…').disabled"), true);
  await waitText("Download CSV dimulai");
  assert.equal(await evaluate("window.exportRequests"), 1);
  assert.equal((await text()).includes("Export CSV gagal"), false);
  await evaluate("window.fetch = window.realFetch");
  await fill("filter-month", "");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Export CSV').disabled"), true);
  await fill("filter-month", "2026-10");
  await waitText("UI tiga");
  console.log("PASS export error/retry, pending/double-click guard, invalid month disables export");
  await capture("desktop.png", 1366, 900);
  await click("Tambah Transaksi");
  await fill("amount_rupiah", "123456");
  await capture("mobile-form.png", 390, 844);
  await click("Batal");
  await until(async () => await evaluate("document.activeElement.textContent.trim() === 'Tambah Transaksi'"), "focus returns to add after cancel");
  await capture("mobile-list.png", 390, 844);
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: categoryFault.identifier });
  await send("Page.navigate", { url: `${ui}/` });
  await waitText("Dashboard Keuangan");
  await waitText("Total Pemasukan");
  await waitText("Total Pengeluaran");
  await waitText("Arus Kas Bersih");
  await waitText("Alokasi Pengeluaran");
  await waitText("Aktivitas Transaksi Terbaru");
  const dashboardFailures = [];
  async function dashboardCheck(name, check) {
    try { await check(); console.log(`PASS ${name}`); }
    catch (error) { dashboardFailures.push(`${name}: ${error.message}`); console.error(`FAIL ${name}: ${error.message}`); }
  }
  const metricTexts = () => evaluate("[...document.querySelectorAll('section[aria-label=\"Ringkasan Arus Kas\"] article')].map(el => el.innerText.replace(/\\s+/g, ' '))");
  const setPeriod = (value) => evaluate(`{ const el = document.querySelector('#dashboard-period'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); }`);
  const follow = (href) => evaluate(`document.querySelector('a[href="${href}"]').click()`);
  async function expectMetrics(income, expense, net) {
    await until(async () => {
      const cards = await metricTexts();
      return cards[0]?.includes(income) && cards[1]?.includes(expense) && cards[2]?.includes(net);
    }, `dashboard metrics ${income}/${expense}/${net}`);
  }
  const transport = categories.find((item) => item.name === "Transport").id;
  for (const item of [
    { category_id: salary, type: "income", amount_rupiah: "1000", date: "2026-07-01", description: "July income" },
    { category_id: transport, type: "expense", amount_rupiah: "100", date: "2026-07-02", description: "July transport" },
    { category_id: food, type: "expense", amount_rupiah: "300", date: "2026-07-03", description: "July food" },
    { category_id: salary, type: "income", amount_rupiah: "50", date: "2026-08-01", description: "August income" },
  ]) await apiRequest("/transactions", "POST", item);

  // These assertions catch incorrect widget values, period leakage and ordering.
  await dashboardCheck("dashboard period switch updates all widgets", async () => {
    await setPeriod("2026-07");
    await expectMetrics("Rp 1.000", "Rp 400", "Rp 600");
    await waitText("75.0%");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Aktivitas Transaksi Terbaru\"]').innerText.includes('July food')"), true);
    const recentText = await evaluate("document.querySelector('[aria-label=\"Aktivitas Transaksi Terbaru\"]').innerText");
    assert.ok(recentText.indexOf("July food") < recentText.indexOf("July transport"));
    assert.ok(recentText.indexOf("July transport") < recentText.indexOf("July income"));
    await setPeriod("2026-08");
    await expectMetrics("Rp 50", "Rp 0", "Rp 50");
    await waitText("August income");
    assert.equal((await text()).includes("July food"), false);
    await waitText("Belum ada transaksi pengeluaran");
  });

  const summaryFault = await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/analytics/summary') ? Promise.reject(new TypeError('offline summary')) : window.realFetch(...args);" });
  await send("Page.navigate", { url: `${ui}/` });
  await waitText("Dashboard Keuangan");
  await setPeriod("2026-07");
  await waitText("Gagal memuat data dashboard");
  await dashboardCheck("initial summary failure never displays zero totals", async () => {
    const cards = await metricTexts();
    assert.ok(cards.every((card) => card.includes("Data tidak tersedia")), JSON.stringify(cards));
    assert.ok(cards.every((card) => !card.includes("Rp ")));
  });
  await dashboardCheck("breakdown percentages remain correct without summary", async () => {
    await waitText("75.0%");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[role=progressbar]')].map(el => el.getAttribute('aria-valuenow'))"), ["75", "25"]);
  });
  await evaluate("window.fetch = window.realFetch");
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: summaryFault.identifier });
  await click("Coba lagi");
  await expectMetrics("Rp 1.000", "Rp 400", "Rp 600");

  const dashboardCategoryFault = await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/categories') ? Promise.reject(new TypeError('offline categories')) : window.realFetch(...args);" });
  await send("Page.reload");
  await waitText("Kategori #");
  await dashboardCheck("dashboard categories expose failure and retry", async () => {
    await waitText("Kategori gagal dimuat");
    await evaluate("window.fetch = window.realFetch");
    await click("Coba lagi kategori");
    await until(async () => !(await text()).includes("Kategori #"), "category labels recover");
    assert.ok((await text()).includes("Makanan"));
  });
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: dashboardCategoryFault.identifier });
  await evaluate("window.fetch = window.realFetch");
  await dashboardCheck("dashboard supports year 0001 without rewriting it to 1901", async () => {
    await setPeriod("0001-01");
    await expectMetrics("Rp 0", "Rp 0", "Rp 0");
    await waitText("Belum ada transaksi di bulan ini");
    assert.ok((await text()).includes("Januari 1"));
    assert.equal((await text()).includes("1901"), false);
    assert.equal((await text()).includes("Gagal memuat"), false);
  });

  // Real SPA navigation keeps the QueryClient cache alive across mutations.
  await send("Page.navigate", { url: `${ui}/` });
  await waitText("Dashboard Keuangan");
  await expectMetrics("Rp 0", "Rp 22", "-Rp 22");
  await dashboardCheck("create/edit/delete refresh cached dashboard widgets", async () => {
    await follow("/transactions");
    await waitText("Tambah Transaksi");
    await click("Tambah Transaksi");
    await fill("date", "2026-10-09");
    await fill("category_id", String(food));
    await fill("amount_rupiah", "80");
    await fill("description", "Dashboard mutation");
    await click("Simpan transaksi");
    await until(async () => !await evaluate("Boolean(document.querySelector('[name=date]'))"), "dashboard create closes");
    await follow("/");
    await expectMetrics("Rp 0", "Rp 102", "-Rp 102");
    await waitText("Dashboard mutation");
    await until(async () => await evaluate("document.querySelector('[aria-label=\"Alokasi Pengeluaran\"]').innerText.replace(/\\s+/g, ' ').includes('Rp 102')"), "breakdown updates after create");
    await follow("/transactions");
    await waitText("Dashboard mutation");
    await until(async () => await evaluate("Boolean(document.querySelector('button[aria-label=\"Edit transaksi Dashboard mutation\"]'))"), "created dashboard transaction is editable");
    await evaluate("document.querySelector('button[aria-label=\"Edit transaksi Dashboard mutation\"]').click()");
    await fill("amount_rupiah", "120");
    await click("Simpan perubahan");
    await until(async () => !await evaluate("Boolean(document.querySelector('[name=date]'))"), "dashboard edit closes");
    await evaluate("window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/analytics/summary') ? Promise.reject(new TypeError('offline refetch')) : window.realFetch(...args)");
    await follow("/");
    await waitText("Gagal memuat data dashboard");
    const failedCards = await metricTexts();
    assert.ok(failedCards.every((card) => card.includes("Data tidak tersedia") && !card.includes("Rp ")), "failed refetch must not present cached totals as current");
    await until(async () => await evaluate("document.querySelector('[aria-label=\"Alokasi Pengeluaran\"]').innerText.replace(/\\s+/g, ' ').includes('Rp 142')"), "breakdown remains usable during summary failure");
    await evaluate("window.fetch = window.realFetch");
    await click("Coba lagi");
    await expectMetrics("Rp 0", "Rp 142", "-Rp 142");
    await until(async () => await evaluate("document.querySelector('[aria-label=\"Aktivitas Transaksi Terbaru\"]').innerText.replace(/\\s+/g, ' ').includes('Rp 120')"), "recent amount updates after edit");
    await follow("/transactions");
    await waitText("Dashboard mutation");
    await until(async () => await evaluate("Boolean(document.querySelector('button[aria-label=\"Hapus transaksi Dashboard mutation\"]'))"), "edited dashboard transaction is deletable");
    await evaluate("document.querySelector('button[aria-label=\"Hapus transaksi Dashboard mutation\"]').click()");
    await click("Hapus transaksi");
    await until(async () => !await evaluate("Boolean(document.querySelector('dialog'))"), "dashboard delete closes");
    await follow("/");
    await expectMetrics("Rp 0", "Rp 22", "-Rp 22");
    await until(async () => !(await text()).includes("Dashboard mutation"), "recent row removed after delete");
  });
  assert.deepEqual(dashboardFailures, []);
  await evaluate("window.scrollTo(0, 0)");
  await capture("desktop-dashboard.png", 1366, 900);
  await capture("mobile-dashboard.png", 390, 844);
  console.log("PASS dashboard renders summary metrics, category breakdown and recent transactions");
  assert.deepEqual(consoleErrors, []);
  console.log("PASS desktop/mobile no page overflow, captures, no uncaught browser errors");
  console.log(`Browser tests passed. Artifacts: ${artifacts}`);
} catch (error) {
  console.error(error);
  for (const child of children) console.error(child.log());
  process.exitCode = 1;
} finally {
  socket?.close();
  for (const child of children.reverse()) child.kill();
  // Leave this run's temp artifacts for inspection; never delete user data.
}
