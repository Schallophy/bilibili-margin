import type { Video } from '../api/feed';
import { fmtAgo, fmtCount, fmtDuration, h, icon, ICONS } from './dom';
import { laterButton } from './later-btn';

const thumb = (url: string) => (url ? `${url}@672w_378h_1c.webp` : '');
export const cardData = new WeakMap<Element, Video>();

export interface CardOpts {
  onBlock?: (v: Video) => void; compact?: boolean;
  /** 「不感兴趣」（v0.46）：只有推荐流的卡片有 */
  onDislike?: (v: Video, card: HTMLElement) => void;
  /** 首页「卡片信息」里关掉的项（v0.43）：author / views / danmaku / ago / dur / reason */
  hide?: ReadonlySet<string>;
}

export function videoCard(v: Video, index: number, opts: CardOpts = {}): HTMLElement {
  const href = `https://www.bilibili.com/video/${v.bvid}`;
  const cover = h('a', { class: 'cover', href, target: '_blank', rel: 'noopener', title: v.title },
    h('img', { src: thumb(v.cover), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }),
    v.duration && !opts.hide?.has('dur') ? h('span', { class: 'dur' }, fmtDuration(v.duration)) : null,
    laterButton(v.bvid),
  );
  const acts: HTMLElement[] = [];
  if (opts.onDislike && v.trackId) {
    acts.push(h('button', {
      class: 'card-nope', type: 'button', title: '不感兴趣：以后少推这类视频', 'aria-label': `不感兴趣：${v.title}`,
      onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); opts.onDislike!(v, el); },
    }, icon(ICONS.close), h('span', {}, '不感兴趣')));
  }
  if (opts.onBlock) {
    acts.push(h('button', {
      class: 'card-block', type: 'button', title: `不看 ${v.author} 的视频`, 'aria-label': `屏蔽 UP 主 ${v.author}`,
      onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); opts.onBlock!(v); },
    }, icon(ICONS.block), h('span', {}, '屏蔽 UP')));
  }
  if (acts.length) cover.append(h('div', { class: 'card-acts' }, ...acts));
  const el = h('article', { class: `card${opts.compact ? ' compact' : ''}`, style: `--i:${index % 12}` },
    cover,
    h('div', { class: 'body' },
      h('a', { class: 'title', href, target: '_blank', rel: 'noopener' }, v.title),
      metaRow(v, opts),
      v.reason && !opts.hide?.has('reason') ? h('span', { class: 'reason' }, v.reason) : null,
    ),
  );
  cardData.set(el, v);
  return el;
}

/** 卡片信息行：只放没关掉的项，分隔点跟在前一项后面，不会出现打头的「·」 */
function metaRow(v: Video, opts: CardOpts): HTMLElement {
  const off = (k: string) => !!opts.hide?.has(k);
  const parts: [HTMLElement, string][] = [];
  if (!off('author')) parts.push([h('a', { class: 'author', href: `https://space.bilibili.com/${v.mid}`, target: '_blank', rel: 'noopener' }, v.author), '']);
  if (!off('views')) parts.push([h('span', {}, `${fmtCount(v.views)} 播放`), '']);
  if (v.danmaku && !off('danmaku')) parts.push([h('span', {}, `${fmtCount(v.danmaku)} 弹幕`), '']);
  if (v.pubdate && !opts.compact && !off('ago')) parts.push([h('span', { class: 'm-ago' }, fmtAgo(v.pubdate)), 'm-ago']);
  const meta = h('div', { class: 'meta' });
  parts.forEach(([el, cls], i) => { if (i) meta.append(h('span', { class: cls ? `dot ${cls}` : 'dot' }, '·')); meta.append(el); });
  if (!parts.length) meta.style.display = 'none';
  return meta;
}

export function skeleton(n: number): DocumentFragment {
  const f = document.createDocumentFragment();
  for (let i = 0; i < n; i++) f.append(h('div', { class: 'card sk' }, h('div', { class: 'cover' }), h('div', { class: 'line' }), h('div', { class: 'line short' })));
  return f;
}
