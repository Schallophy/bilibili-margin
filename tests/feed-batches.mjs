// 推荐批次导航：验证切窗、左右翻批不发请求、换一批追加并跳转、关闭自动补页、
// 无刷新键时的末批加载，以及修改每批条数后重新切窗。
//   npm run build && node tests/feed-batches.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installMocks } from './mocks.mjs';

const out = resolve(process.env.SMOKE_OUT || 'tests/artifacts/feed-batches');
mkdirSync(out, { recursive: true });
const extension = resolve(process.env.SMOKE_EXT || 'dist'), results = [], errors = [];
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'margin-feed-batches-')), {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  headless: true, args: ['--headless=new', '--no-sandbox', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1440, height: 900 }, locale: 'zh-CN',
});
const NOW = Math.floor(Date.now() / 1000);
let rcmdCalls = 0;
/** 每次推荐请求返回 12 条，标题带全局序号：第 n 条 = (fresh_idx - 1) * 12 + i + 1 */
const page_ = async (url) => {
  if (!url.includes('/x/web-interface/wbi/index/top/feed/rcmd')) return null;
  rcmdCalls++;
  const round = Number(new URL(url).searchParams.get('fresh_idx') ?? 1);
  return { code: 0, data: { item: Array.from({ length: 12 }, (_, i) => {
    const n = (round - 1) * 12 + i + 1;
    return { goto: 'av', bvid: `BV${String(n).padStart(10, '0')}`, cid: n, title: `第 ${n} 条推荐`, pic: `https://i0.hdslb.com/bfs/x${n}.jpg`,
      duration: 300, pubdate: NOW, owner: { name: '批量 UP', mid: n, face: '' }, stat: { view: 1000, danmaku: 10 } };
  }) } };
};
try {
  await installMocks(context, page_);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
  const seed = (extra) => worker.evaluate((patch) => chrome.storage.local.set({ 'margin:settings': {
    intro: false, theme: 'light', bg: { mode: 'off' }, footprint: false, weather: false,
    batchNav: true, batchSize: 12, batchRefresh: true, ...patch,
  } }), extra);
  const R = "document.getElementById('margin-root').shadowRoot";
  const cards = () => page.evaluate(`(${R}).querySelectorAll('.grid .card:not(.sk)').length`);
  const firstTitle = () => page.evaluate(`(${R}).querySelector('.grid .card .title')?.textContent ?? ''`);
  const bar = (sel) => page.evaluate(`(() => { const e = (${R}).querySelector('${sel}'); return e ? { hidden: e.hidden, off: e.dataset.off, display: getComputedStyle(e).display } : null; })()`);
  const until = async (fn, ms = 5000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await fn()) return; await page.waitForTimeout(80); }
    throw new Error('timeout');
  };
  const passed = (name) => { results.push(name); console.log(`PASS ${name}`); };

  await seed({});
  await page.goto('https://www.bilibili.com/');
  await until(async () => (await cards()) === 12);
  assert.equal(await firstTitle(), '第 1 条推荐');
  assert.equal((await bar('.batch-bar'))?.hidden, false);
  assert.equal((await bar('.batch-btn:first-child'))?.off, 'true');
  assert.equal((await bar('.batch-btn:last-child'))?.off, 'false');
  assert.equal(await page.evaluate(`(${R}).querySelector('.bar-acts > .batch-bar') !== null`), true);
  assert.equal(await page.evaluate(`getComputedStyle((${R}).querySelector('.bar-acts > .refresh')).display`), 'none');
  passed('首批 12 条，导航条占据原换一批位置');

  const calls = rcmdCalls;
  await page.evaluate(`(${R}).querySelector('.batch-btn:last-child').click()`);
  await until(async () => (await firstTitle()) === '第 13 条推荐');
  assert.equal(await cards(), 12);
  assert.equal(rcmdCalls, calls, '翻到下一批不应发请求');
  await page.evaluate(`(${R}).querySelector('.app').scrollTo(0, 99999)`);
  await page.waitForTimeout(500);
  assert.equal(rcmdCalls, calls, '批次模式不应随滚动补页');
  await page.evaluate(`(${R}).querySelector('.batch-btn:first-child').click()`);
  await until(async () => (await firstTitle()) === '第 1 条推荐');
  passed('左右箭头零请求翻批，滚动不补页');

  await page.evaluate(`(${R}).querySelector('.batch-btn.go').click()`);
  await until(async () => (await firstTitle()) === '第 25 条推荐');
  assert.equal(rcmdCalls, calls + 2, '换一批只追加一页（两次推荐请求）');
  assert.equal(await cards(), 12);
  passed('换一批追加一页并跳到新内容所在批次');

  await seed({ batchSize: 24 });
  await until(async () => (await cards()) === 24);
  assert.equal(await firstTitle(), '第 25 条推荐');
  assert.equal(rcmdCalls, calls + 2, '改每批条数不应重新请求');
  passed('修改每批条数围绕当前位置重新切窗');

  await seed({ batchSize: 24, batchRefresh: false });
  await page.reload();
  await until(async () => (await cards()) === 24);
  assert.equal((await bar('.batch-btn.go'))?.hidden, true);
  assert.equal((await bar('.batch-btn:last-child'))?.off, 'false');
  const hiddenCalls = rcmdCalls;
  await page.evaluate(`(${R}).querySelector('.batch-btn:last-child').click()`);
  await until(async () => (await firstTitle()) === '第 25 条推荐');
  assert.equal(rcmdCalls, hiddenCalls + 2, '无刷新键时末批右箭头负责加载');
  assert.equal((await bar('.batch-btn.go'))?.hidden, true);
  passed('无刷新键：末批右箭头加载下一批');

  await page.screenshot({ path: join(out, 'batch-bar.png') });
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors, rcmdCalls }, null, 2));
  await context.close();
}
