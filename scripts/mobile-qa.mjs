// Mobile QA: checks each URL at iPhone 13 viewport (390x844).
// PASS criteria: innerWidth 390, no horizontal overflow, no broken images.
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
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      brokenImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src.slice(0, 120)),
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
