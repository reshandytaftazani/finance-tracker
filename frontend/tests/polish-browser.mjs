import assert from "node:assert/strict";

// Real rendered regressions: removing focus recovery, wrapping, accessible
// navigation or readable text must break these checks, not just change source.
export async function checkPolish({ send, evaluate, waitText, until, click, apiRequest, ui, categories, capture }) {
  const failures = [];
  async function check(name, run) {
    try { await run(); console.log(`PASS polish: ${name}`); }
    catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL polish: ${name}: ${error.message}`); }
  }
  const tab = async (shift = false) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
  };
  const keyboard = async (key, code = key, windowsVirtualKeyCode = 13) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
  };
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${ui}/transactions` });
  await waitText("Export CSV");
  await evaluate("window.realFetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/export/csv') ? Promise.reject(new TypeError('offline export')) : window.realFetch(...args)");
  await click("Export CSV");
  await waitText("Export CSV gagal");
  await evaluate("window.fetch = window.realFetch");
  await click("Coba lagi export");
  await waitText("Download CSV dimulai");
  await check("export retry returns keyboard focus to persistent export action", async () => {
    await until(async () => await evaluate("document.activeElement.textContent.trim() === 'Export CSV'"), "export retry focus", 1500);
  });
  for (const outcome of ["success", "failure", "moved"]) {
    await evaluate(`window.fetch = (...args) => String(args[0]).includes('/export/csv') ? new Promise((yes,no) => setTimeout(() => ${outcome === "failure" ? "no(new TypeError('offline export'))" : "window.realFetch(...args).then(yes,no)"}, 500)) : window.realFetch(...args)`);
    await click("Export CSV");
    await waitText("Mengekspor…");
    if (outcome === "moved") await evaluate("document.querySelector('#filter-month').focus()");
    await waitText(outcome === "failure" ? "Export CSV gagal" : "Download CSV dimulai");
    await check(`primary export focus after delayed ${outcome}`, async () => {
      await until(async () => await evaluate(outcome === "moved" ? "document.activeElement.id === 'filter-month'" : "document.activeElement.textContent.trim() === 'Export CSV'"), `primary export ${outcome} focus`, 1500);
    });
    await evaluate("window.fetch = window.realFetch");
  }

  const salary = categories.find((item) => item.name === "Gaji").id;
  const food = categories.find((item) => item.name === "Makanan").id;
  for (const [category_id, type, description] of [[salary, "income", "Large income"], [food, "expense", "Large expense"]]) {
    await apiRequest("/transactions", "POST", { category_id, type, amount_rupiah: "9999999999999", date: "2026-10-09", description });
  }
  await send("Page.navigate", { url: `${ui}/` });
  await waitText("Large income");
  await check("keyboard can skip navigation and reach main content", async () => {
    await evaluate("document.activeElement.blur(); window.scrollTo(0,0)");
    await tab();
    assert.equal(await evaluate("document.activeElement.textContent.trim()"), "Lewati ke konten utama");
    await keyboard("Enter");
    assert.equal(await evaluate("document.activeElement.tagName"), "MAIN");
  });
  for (const width of [320, 1366]) {
    await check(`skip target heading remains visible below sticky header at ${width}px`, async () => {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await evaluate("window.scrollTo(0,0); document.querySelector('a[href=\"#main-content\"]').focus()");
      await keyboard("Enter");
      assert.equal(await evaluate("document.querySelector('h1').getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom"), true);
    });
  }
  await check("active destination is announced in desktop and mobile navigation", async () => {
    assert.equal(await evaluate("[...document.querySelectorAll('header a[href=\"/\"]')].every(el => el.getAttribute('aria-current') === 'page')"), true);
    assert.equal(await evaluate("document.querySelectorAll('nav[aria-label=\"Navigasi utama\"]').length"), 2);
  });
  await check("period control has a visible keyboard focus indicator", async () => {
    await evaluate("document.querySelector('#dashboard-period').focus()");
    await tab(); await tab(true);
    assert.equal(await evaluate("document.activeElement.id"), "dashboard-period");
    assert.equal(await evaluate("(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; })()"), true);
  });
  await check("dashboard secondary text meets normal-text contrast", async () => {
    const lowContrast = await evaluate(`(() => {
      // Tailwind v4 emits oklch colors. Let the browser resolve CSS colors to
      // sRGB instead of mistaking oklch channels for RGB channel values.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgb = value => { context.clearRect(0,0,1,1); context.fillStyle = value; context.fillRect(0,0,1,1); return [...context.getImageData(0,0,1,1).data].slice(0,3); };
      const luminance = c => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n,v,i) => n + v * [.2126,.7152,.0722][i],0);
      return [...document.querySelectorAll('main p, main span')].filter(el => el.getBoundingClientRect().width && el.textContent.trim()).flatMap(el => {
        const s = getComputedStyle(el); if (parseFloat(s.fontSize) >= 24) return [];
        const a = luminance(rgb(s.color));
        const backgrounds = []; let parent = el;
        while (parent) { backgrounds.push(getComputedStyle(parent).backgroundColor); parent = parent.parentElement; }
        // Composite translucent hover surfaces over their ancestor background,
        // matching rendered contrast instead of treating alpha as opaque.
        context.clearRect(0,0,1,1); context.fillStyle = 'white'; context.fillRect(0,0,1,1);
        for (const background of backgrounds.reverse()) { context.fillStyle = background; context.fillRect(0,0,1,1); }
        const b = luminance([...context.getImageData(0,0,1,1).data].slice(0,3));
        const contrast = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        return contrast < 4.5 ? [{ text: el.textContent.trim(), contrast }] : [];
      });
    })()`);
    assert.deepEqual(lowContrast, []);
  });
  for (const width of [320, 390, 768, 1366]) {
    await check(`large exact amounts fit dashboard at ${width}px`, async () => {
      await evaluate("document.activeElement.blur(); window.scrollTo(0,0)");
      await capture(`polish-dashboard-${width}.png`, width, 900);
      assert.equal(await evaluate("[...document.querySelectorAll('main article')].every(el => el.scrollWidth <= el.clientWidth)"), true, "metric content must fit its card, not just the page");
      assert.ok(await evaluate("document.querySelector('[aria-label=\"Ringkasan Arus Kas\"]').innerText.replace(/\\s+/g, ' ').includes('Rp 9.999.999.999.999')"));
    });
    if (width === 320) await check("recent transaction metadata does not overlap large amounts on mobile", async () => {
      assert.equal(await evaluate("[...document.querySelectorAll('[aria-label=\"Aktivitas Transaksi Terbaru\"] .divide-y > div')].every(row => { const metadata = row.firstElementChild.firstElementChild; return metadata.scrollWidth <= metadata.clientWidth; })"), true);
    });
  }
  await send("Page.navigate", { url: `${ui}/transactions` });
  await waitText("Large expense");
  await check("transaction table stays scrollable rather than expanding a 320px page", () => capture("polish-transactions-320.png", 320, 900));
  await click("Tambah Transaksi");
  await check("transaction form fits a 320px page", () => capture("polish-form-320.png", 320, 900));
  await click("Batal");
  assert.deepEqual(failures, []);
}
