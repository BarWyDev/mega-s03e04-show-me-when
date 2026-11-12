// Records the board in use (Chrome screencast frames, encoded with ffmpeg) and writes a timeline next to it.
// Usage: node scripts/record.mjs <url> <out dir>
// The pointer is scripted; a dot is drawn where it is, because browser video does not show the cursor.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const url = process.argv[2];
const dir = process.argv[3] ?? 'rec';
mkdirSync(dir, { recursive: true });
const size = { width: 1100, height: 720 };
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: size, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
const page = await ctx.newPage();
// screencast: Chrome sends a frame whenever the page repaints; each is kept with its time
const frameDir = `${dir}/frames`;
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', (f) => {
  const file = `${frameDir}/${String(frames.length).padStart(5, '0')}.jpg`;
  writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, t: Date.now() });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
const t0 = Date.now();
const timeline = [];
const mark = (what, extra = {}) => {
  const s = (Date.now() - t0) / 1000;
  const at = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  timeline.push({ at, s: Number(s.toFixed(2)), what, ...extra });
  console.log(at, what, JSON.stringify(extra));
};
const receipts = [];
page.on('console', (m) => { if (m.text().startsWith('ack ')) { const [, id, ackedAt, receipt] = m.text().split(' '); receipts.push({ id, ackedAt, receipt }); } });
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:9999;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(220,0,60,.75);border:2px solid #fff;box-shadow:0 0 0 1px #900;pointer-events:none;left:-50px;top:-50px;transition:transform .08s';
    document.body.append(dot);
    addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(1.8)'; }, true);
    addEventListener('mouseup', () => { setTimeout(() => (dot.style.transform = ''), 150); }, true);
  });
});
const rows = page.getByTestId('incident-row');
const topId = () => rows.first().getAttribute('data-id');
const idAt = (x, y) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="incident-row"]')?.dataset.id ?? null, [x, y]);
const waitNewTop = async (id) => { await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, id, { timeout: 60000, polling: 50 }); return topId(); };

// open-board
await page.goto(url);
mark('open-board: page opened', { loaderVisible: await page.getByTestId('loader').isVisible().catch(() => false) });
await rows.first().waitFor();
mark('open-board: incidents on screen, loader gone', { rows: await rows.count(), loaders: await page.getByTestId('loader').count(), sha: await page.getByTestId('build-sha').textContent() });
await page.waitForTimeout(2500);

// watch-board: a new incident arrives at the top, no reload
let top = await topId();
top = await waitNewTop(top);
mark('watch-board: new incident at the top, no reload', { id: top, rows: await rows.count() });
await page.waitForTimeout(3000);

// ack-incident: aim at one row's Ack, slowly, like a person
const target = rows.nth(1);
const targetId = await target.getAttribute('data-id');
const box = await target.getByTestId('ack').boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
await page.mouse.move(600, 600);
await page.mouse.move(x, y, { steps: 40 });
mark('ack-incident: pointer on the Ack of the row on-call picked', { picked: targetId, underPointer: await idAt(x, y) });
// the board refreshes while the pointer rests there; the click goes down right after the next arrival
const arrived = await waitNewTop(top);
const hit = await idAt(x, y);
await page.mouse.down();
await page.mouse.up();
mark('ack-incident: click, right after a new incident arrived', { arrived, picked: targetId, underPointer: hit });
await page.getByTestId('acked').first().waitFor();
const ackedId = await page.getByTestId('acked').first().evaluate((n) => n.closest('[data-testid="incident-row"]').dataset.id);
mark('ack-incident: row marked acked', { ackedRow: ackedId, picked: targetId });
await page.waitForTimeout(5000);
mark('end', { ackedMarks: await page.getByTestId('acked').count() });

const tEnd = Date.now();
await cdp.send('Page.stopScreencast');
await ctx.close();
await browser.close();
writeFileSync(`${dir}/timeline.json`, JSON.stringify({ url, startedAt: new Date(t0).toISOString(), timeline, receipts }, null, 2));
// encode: every frame stays on screen until the next one; time zero is t0
const lines = [];
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
  const from = i === 0 ? t0 : f.t;
  lines.push(`file '${f.file.replace(`${dir}/`, '')}'`, `duration ${(Math.max(next - from, 1) / 1000).toFixed(3)}`);
});
lines.push(`file '${frames.at(-1).file.replace(`${dir}/`, '')}'`);
writeFileSync(`${dir}/frames.txt`, lines.join('\n') + '\n');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/frames.txt`, '-vf', `fps=25,scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-movflags', '+faststart', `${dir}/board.mp4`]);
rmSync(frameDir, { recursive: true, force: true });
console.log('receipts', receipts.length);
