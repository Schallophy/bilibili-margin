/**
 * X 式重排（v0.48 实验，用户：x 式的推流方式）。思路照 X 开源推荐的三段：
 *   召回：B 站给的推荐（网页或 App）+ 关注的人 48 小时内的新稿（站内 / in-network）；
 *   打分：保留 B 站原排序做先验，加上你对这个 UP 的偏好（观看历史里点开、看完的次数，越近越重），
 *         秒退（看了不到 10 秒）和「不感兴趣」扣分；
 *   过滤与多样性：看过的不再出现，同一个 UP 不连着出，同一批里重复的 UP 逐次降权。
 * 全部在本机算：历史只从 B 站自己的观看历史接口读（6 小时缓存一次），负反馈存在 chrome.storage.local。
 */
import type { Video } from './api/feed';
import { historyList, type Cursor } from './api/history';
import { followFeed } from './api/dyn';

const TASTE_KEY = 'margin:taste';
const NEG_KEY = 'margin:taste-neg';
const TTL = 6 * 3600_000;

interface Taste { at: number; ups: Record<string, number>; seen: string[] }
type Neg = Record<string, number>;

let taste: Promise<Taste> | null = null;
let neg: Neg | null = null;
let fresh: Video[] | null = null;
let freshP: Promise<void> | null = null;

const BV = /\/video\/(BV[0-9A-Za-z]{10})/;

async function buildTaste(): Promise<Taste> {
  const ups: Record<string, number> = {};
  const seen: string[] = [];
  const now = Date.now() / 1000;
  let c: Cursor | null = null;
  for (let page = 0; page < 4; page++) {
    const r: Awaited<ReturnType<typeof historyList>> | null = await historyList('archive', c).catch(() => null);
    if (!r) break;
    for (const it of r.list) {
      const bv = BV.exec(it.url)?.[1];
      if (bv) seen.push(bv);
      if (!it.mid) continue;
      const days = Math.max(0, (now - it.viewAt) / 86400);
      const decay = Math.exp(-days / 30);
      // progress = -1 表示看完；看了不到 10 秒算秒退（弱负反馈）
      const done = it.progress < 0 ? 1 : it.duration ? Math.min(1, it.progress / it.duration) : 0;
      const quit = it.progress >= 0 && it.progress < 10 && it.duration > 60;
      ups[it.mid] = (ups[it.mid] || 0) + decay * (quit ? -0.3 : 0.3 + done);
    }
    c = r.cursor;
    if (!c) break;
  }
  const t: Taste = { at: Date.now(), ups, seen: seen.slice(0, 400) };
  chrome.storage.local.set({ [TASTE_KEY]: t }).catch(() => {});
  return t;
}

function getTaste(): Promise<Taste> {
  taste ??= chrome.storage.local.get([TASTE_KEY, NEG_KEY]).then((v) => {
    neg = (v[NEG_KEY] as Neg | undefined) ?? {};
    const t = v[TASTE_KEY] as Taste | undefined;
    return t && Date.now() - t.at < TTL ? t : buildTaste();
  }).catch(() => ({ at: 0, ups: {}, seen: [] }));
  return taste;
}

const parseCount = (s: string) => { const m = /([\d.]+)\s*(万|亿)?/.exec(s || ''); return m ? Math.round(parseFloat(m[1]) * (m[2] === '亿' ? 1e8 : m[2] === '万' ? 1e4 : 1)) : 0; };
const parseDur = (s: string) => (s || '').split(':').reduce((a, x) => a * 60 + (Number(x) || 0), 0);

/** 关注的人 48 小时内的视频动态，一次会话取一页，分批混进推荐 */
function loadFresh(): Promise<void> {
  freshP ??= followFeed('video', '').then((r) => {
    const cut = Date.now() / 1000 - 48 * 3600;
    fresh = r.list.filter((d) => d.video?.bvid && d.ts >= cut).map((d) => ({
      bvid: d.video!.bvid, cid: 0, title: d.video!.title, cover: d.video!.cover, duration: parseDur(d.video!.dur),
      author: d.author, mid: d.mid, face: d.face, views: parseCount(d.video!.play), danmaku: 0, pubdate: d.ts, reason: '关注 · 新稿',
    }));
  }).catch(() => { fresh = []; });
  return freshP;
}

/** 「不感兴趣」/ 屏蔽 UP 主时记一笔，之后这个 UP 的视频往后排 */
export function noteNegative(mid: number, w = 1): void {
  if (!mid) return;
  getTaste().then(() => {
    neg ??= {};
    neg[mid] = Math.min(5, (neg[mid] || 0) + w);
    chrome.storage.local.set({ [NEG_KEY]: neg }).catch(() => {});
  });
}

/** 换一批时重新混入关注新稿（历史画像沿用 6 小时缓存） */
export function resetRank(): void { freshP = null; fresh = null; }

/**
 * 给一批推荐重新排序。recent = 网格里最后几张卡的 UP（跨批次保持「同一 UP 不连着出」），
 * shown = 已经出现过的 bvid。
 */
export async function rerank(batch: Video[], recent: number[], shown: Set<string>): Promise<Video[]> {
  const [t] = await Promise.all([getTaste(), loadFresh()]);
  const seen = new Set(t.seen);
  const n = batch.length || 1;
  type C = { v: Video; s: number };
  const pool: C[] = [];
  batch.forEach((v, i) => {
    if (seen.has(v.bvid)) return; // 看过的不再出现
    pool.push({ v, s: 1 - (i / n) * 0.5 });
  });
  // 站内召回：每批最多混 3 条关注新稿
  const add = (fresh ?? []).filter((v) => !shown.has(v.bvid) && !seen.has(v.bvid)).slice(0, 3);
  if (fresh) fresh = fresh.filter((v) => !add.includes(v));
  for (const v of add) pool.push({ v, s: 1.1 });
  for (const c of pool) {
    const up = t.ups[c.v.mid] || 0;
    c.s += 0.6 * Math.tanh(up / 2) - 0.8 * (neg?.[c.v.mid] || 0);
    if (up > 1.5 && !c.v.reason) c.v = { ...c.v, reason: '常看的 UP' };
  }
  // 多样性：贪心取最高分；最近 3 张里出现过的 UP 降 0.5，本批里每重复一次再乘 0.6
  const out: Video[] = [];
  const last = recent.slice(-3);
  const count: Record<string, number> = {};
  while (pool.length) {
    let best = 0, bs = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const m = pool[i].v.mid;
      let s = pool[i].s;
      if (m && last.includes(m)) s -= 0.5;
      s *= Math.pow(0.6, count[m] || 0);
      if (s > bs) { bs = s; best = i; }
    }
    const [c] = pool.splice(best, 1);
    out.push(c.v);
    count[c.v.mid] = (count[c.v.mid] || 0) + 1;
    last.push(c.v.mid); if (last.length > 3) last.shift();
  }
  return out;
}
