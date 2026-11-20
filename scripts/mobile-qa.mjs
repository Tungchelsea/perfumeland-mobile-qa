// Mobile QA: checks each URL at iPhone 13 viewport (390x844).
// PASS criteria: innerWidth 390, no horizontal overflow, no images that
// actually FAILED to load. Lazy below-fold images are scrolled into view
// first so they load before being judged (v1 counted not-yet-loaded lazy
// images as broken — false positives).
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const urls = (process.argv[2] || 'https://perfumeland.store/').split(',').map(s => s.trim()).filter(Boolean);
const outDir = 'mobile-qa';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];
for (const url of urls) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 200)));
  const slug = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    // Scroll through the whole page to trigger lazy-loaded images, then
    // wait for them to finish loading before judging.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const step = () => {
          y += 500;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) setTimeout(step, 120);
          else { window.scrollTo(0, 0); resolve(); }
        };
        step();
      });
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() => ({
      finalUrl: window.location.href,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      totalImages: document.images.length,
      // Only an image that finished loading with zero width actually failed.
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(0, 120)),
      // Images still incomplete after the scroll + waits (informational only).
      stillLoading: [...document.images].filter(i => !i.complete).map(i => i.src.slice(0, 120)),
      h1: document.querySelector('h1')?.innerText?.slice(0, 120) || null,
    }));
    await page.screenshot({ path: `${outDir}/${slug}.png`, fullPage: true });
    results.push({ url, ...m, horizontalOverflow: m.scrollWidth > 391, consoleErrors: consoleErrors.slice(0, 5), status: 'ok' });
  } catch (e) {
    results.push({ url, status: 'error', error: String(e).slice(0, 300), consoleErrors });
  }
  await ctx.close();
}
await browser.close();
const report = { checkedAt: new Date().toISOString(), viewport: 'iPhone 13 390x844', results };
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
const failed = results.filter(r => r.status !== 'ok' || r.horizontalOverflow || (r.brokenImages && r.brokenImages.length));
console.log(JSON.stringify(report, null, 2));
if (failed.length) { console.error(`FAIL: ${failed.length}/${results.length} pages have issues`); process.exit(1); }
console.log(`PASS: ${results.length}/${results.length} pages OK`);
