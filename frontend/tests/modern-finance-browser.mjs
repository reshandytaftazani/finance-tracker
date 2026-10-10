import assert from "node:assert/strict";

// Preserve money readability: no individual 3-digit rupiah group may be split
// across lines, even when a large signed net and its status badge share a card.
export async function checkModernFinance({ send, evaluate, until, waitText, apiRequest, ui, categories, capture }) {
  const failures = [];
  const salary = categories.find((item) => item.name === "Gaji").id;
  const food = categories.find((item) => item.name === "Makanan").id;
  for (const [date, category_id, type] of [["2026-04-09", salary, "income"], ["2026-05-09", food, "expense"]]) {
    for (let i = 0; i < 3; i++) await apiRequest("/transactions", "POST", { date, category_id, type, amount_rupiah: "9999999999999", description: `Readable ${type} ${i}` });
  }
  await send("Page.navigate", { url: `${ui}/` });
  await until(async () => await evaluate("Boolean(document.querySelector('#dashboard-period'))"), "dashboard for visual money checks");
  for (const [period, money, badge] of [["2026-04", "Rp 29.999.999.999.997", "Surplus"], ["2026-05", "-Rp 29.999.999.999.997", "Defisit"]]) {
    await evaluate(`{ const el = document.querySelector('#dashboard-period'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${period}'); el.dispatchEvent(new Event('input',{bubbles:true})); }`);
    await until(async () => await evaluate(`document.querySelector('[aria-label="Ringkasan Arus Kas"]').innerText.replace(/\\s+/g,' ').includes(${JSON.stringify(money)})`), "exact large signed total");
    assert.ok(await evaluate(`document.querySelector('[aria-label="Ringkasan Arus Kas"] article:last-child').innerText.includes('${badge}')`));
    for (const width of [320, 768, 1366]) {
      await evaluate("document.activeElement.blur(); window.scrollTo(0,0)");
      try {
        await capture(`modern-${period}-${width}.png`, width, 900);
        const splitGroups = await evaluate(`(() => {
          const problems = [];
          for (const card of document.querySelectorAll('[aria-label="Ringkasan Arus Kas"] article')) {
            const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT); let node;
            while (node = walker.nextNode()) {
              // Read rendered character positions, not the component's classes.
              // Works both with a single text node and grouped money spans.
              if (!/\\d/.test(node.textContent) || !node.parentElement.closest('[data-money], .font-mono')) continue;
              for (const match of node.textContent.matchAll(/\\d{1,3}\\.?/g)) {
                const tops = [];
                for (let i = match.index; i < match.index + match[0].length; i++) {
                  const range = document.createRange(); range.setStart(node,i); range.setEnd(node,i+1);
                  tops.push(Math.round(range.getBoundingClientRect().top));
                }
                if (new Set(tops).size > 1) problems.push(match[0]);
              }
            }
          }
          return problems;
        })()`);
        assert.deepEqual(splitGroups, [], "rupiah digit groups must stay readable on a single line");
        assert.equal(await evaluate("[...document.querySelectorAll('main article')].every(el => el.scrollWidth <= el.clientWidth)"), true);
        console.log(`PASS Modern Finance: exact ${badge.toLowerCase()} with readable digit groups at ${width}px`);
      } catch (error) { failures.push(`${period}/${width}: ${error.message}`); console.error(`FAIL Modern Finance: ${period}/${width}: ${error.message}`); }
    }
  }

  // Skeleton motion must stop for users requesting reduced motion. Delay only
  // transport so the real React loading surface can be inspected reliably.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const delayed = await send("Page.addScriptToEvaluateOnNewDocument", { source: "const designFetch=window.fetch; window.fetch=(...args)=>new Promise((yes,no)=>setTimeout(()=>designFetch(...args).then(yes,no),1500));" });
  const oldDocument = await evaluate("performance.timeOrigin");
  await send("Page.reload");
  await until(async () => await evaluate(`performance.timeOrigin !== ${oldDocument} && Boolean(document.querySelector('main .animate-pulse'))`), "reduced-motion loading skeleton");
  try {
    assert.equal(await evaluate("[...document.querySelectorAll('main .animate-pulse')].every(el => getComputedStyle(el).animationName === 'none')"), true, "loading skeleton must honor reduced motion");
    console.log("PASS Modern Finance: reduced motion disables skeleton animation");
  } catch (error) { failures.push(error.message); console.error(`FAIL Modern Finance: ${error.message}`); }
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: delayed.identifier });
  await send("Emulation.setEmulatedMedia", { features: [] });
  await waitText("Arus Kas Bersih");
  assert.deepEqual(failures, []);
}
