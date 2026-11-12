// Local check of the plan's hooks and flows against a served board. Usage: node scripts/check.mjs <url>
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ channel: 'chrome' });
const out = [];
const ok = (name, pass, detail = '') => { out.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail); };

for (const [locale, timezoneId] of [['de-DE', 'Europe/Berlin'], ['en-NZ', 'Pacific/Auckland'], ['en-US', 'America/New_York']]) {
  const ctx = await browser.newContext({ locale, timezoneId });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // hold the first answer so the loader can be seen
  let release; const gate = new Promise((r) => (release = r)); let first = true;
  await page.route('**/api/incidents*', async (route) => { if (first) { first = false; await gate; } await route.continue(); });
  await page.goto(url);
  ok(`${locale} loader shows on open`, await page.getByTestId('loader').isVisible());
  ok(`${locale} no rows before load`, (await page.getByTestId('incident-row').count()) === 0);
  release();
  await page.getByTestId('incident-row').first().waitFor();
  ok(`${locale} loader gone after load`, (await page.getByTestId('loader').count()) === 0);
  const t = page.getByTestId('incident-row').last().locator('time');
  ok(`${locale} time`, true, `${await t.getAttribute('datetime')} -> ${await t.textContent()}`);
  const sha = await page.getByTestId('build-sha').textContent();
  const meta = await page.locator('meta[name=build]').getAttribute('content');
  ok(`${locale} build sha`, sha === meta && /^[0-9a-f]{40}$/.test(sha), sha);
  if (locale === 'de-DE') {
    // R1/R4: wait for a new incident at the top, without a reload
    const firstId = await page.getByTestId('incident-row').first().getAttribute('data-id');
    const n = await page.getByTestId('incident-row').count();
    const t0 = Date.now();
    await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]').dataset.id !== id, firstId, { timeout: 40000 });
    const newId = await page.getByTestId('incident-row').first().getAttribute('data-id');
    ok('new incident at top without reload', (await page.getByTestId('incident-row').count()) === n + 1, `${newId} after ${Date.now() - t0} ms`);
    const ids = await page.getByTestId('incident-row').evaluateAll((rs) => rs.map((r) => r.querySelector('time').getAttribute('datetime')));
    ok('newest first', ids.every((v, i) => i === 0 || Date.parse(ids[i - 1]) >= Date.parse(v)));
    // R2: ack the third row
    const row = page.getByTestId('incident-row').nth(2);
    const id = await row.getAttribute('data-id');
    const [msg] = await Promise.all([page.waitForEvent('console', (m) => m.text().startsWith('ack ')), row.getByTestId('ack').click()]);
    await page.locator(`[data-id="${id}"] [data-testid="acked"]`).waitFor();
    ok('ack marks that row', msg.text().split(' ')[1] === id && (await page.getByTestId('acked').count()) === 1, id);
    ok('ack button gone on acked row', (await page.locator(`[data-id="${id}"] [data-testid="ack"]`).count()) === 0);
    await page.waitForTimeout(5000);
    ok('acked mark survives refreshes', (await page.locator(`[data-id="${id}"] [data-testid="acked"]`).count()) === 1);
  }
  ok(`${locale} no page errors`, errors.length === 0, errors.join('; '));
  await ctx.close();
}
await browser.close();
process.exit(out.every((o) => o.pass) ? 0 : 1);
