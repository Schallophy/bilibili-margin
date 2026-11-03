type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/**
 * 把扩展自带的静态标记（图标 SVG、固定结构）解析成节点。用 DOMParser 而不是 innerHTML：
 * 解析出的文档是惰性的（脚本不执行、资源不加载），再导入当前文档。不要把网络来的 HTML 传进来，
 * B 站接口返回的高亮片段走 highlight()。
 */
const parser = new DOMParser();
function nodes(markup: string, inSvg: boolean): Node[] {
  const doc = parser.parseFromString(inSvg ? `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>` : markup, 'text/html');
  const host = inSvg ? doc.body.firstElementChild! : doc.body;
  return [...host.childNodes].map((n) => document.importNode(n, true));
}
/** 用静态标记替换 el 的全部子节点；el 是 SVG 元素（defs / filter / svg）时按 SVG 解析 */
export function setMarkup(el: Element, markup: string): void {
  el.replaceChildren(...nodes(markup, el instanceof SVGElement));
}
/** 在 el 末尾追加静态标记 */
export function appendMarkup(el: Element, markup: string): void {
  el.append(...nodes(markup, el instanceof SVGElement));
}
/**
 * B 站搜索联想返回带 <em class="suggest_high_light"> 的 HTML。只保留高亮，其余一律当纯文本：
 * 拆成文本节点和 <mark>，不把接口内容当 HTML 插入。
 */
export function highlight(el: Element, html: string): void {
  const text = (s: string) => parser.parseFromString(s.replace(/<[^>]*>/g, ''), 'text/html').body.textContent ?? '';
  const out: Node[] = [];
  html.split(/(<em class="suggest_high_light">[\s\S]*?<\/em>)/).forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const m = document.createElement('mark'); m.textContent = text(part); out.push(m); }
    else out.push(document.createTextNode(text(part)));
  });
  el.replaceChildren(...out);
}

export function svg(markup: string): Node {
  return nodes(markup.trim(), false)[0];
}

// 同一个图标只解析一次，之后克隆（v0.44：首页每张卡片都要建几个图标，DOMParser 很贵）
const iconCache = new Map<string, Node>();
export const icon = (paths: string) => {
  let t = iconCache.get(paths);
  if (!t) { t = svg(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`); iconCache.set(paths, t); }
  return t.cloneNode(true);
};

export const ICONS = {
  logo: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 5v14M16 5v14M3 12h18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  moments: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8.8 5 3.2-5 3.2z"/>',
  message: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  fav: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  heat: '<rect x="3.5" y="3.5" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="3.5" width="4.5" height="4.5" rx="1" fill="currentColor"/><rect x="16" y="3.5" width="4.5" height="4.5" rx="1"/><rect x="3.5" y="9.75" width="4.5" height="4.5" rx="1" fill="currentColor"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="16" y="9.75" width="4.5" height="4.5" rx="1" fill="currentColor"/><rect x="3.5" y="16" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="16" width="4.5" height="4.5" rx="1" fill="currentColor"/><rect x="16" y="16" width="4.5" height="4.5" rx="1"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  block: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  later: '<path d="M4 6h12M4 11h12M4 16h7"/><path d="m15 13.5 5 3-5 3z"/>',
  top: '<path d="M6 15l6-6 6 6"/><path d="M5 5h14"/>',
  command: '<path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9V6.5Zm0 0v11m0-11h6m-6 11a2.5 2.5 0 1 1-2.5-2.5H9v2.5Zm0 0h6m0-11a2.5 2.5 0 1 1 2.5 2.5H15V6.5Zm0 0v11m0 0a2.5 2.5 0 1 0 2.5-2.5H15v2.5ZM9 9h6v6H9z"/>',
  palette: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17" opacity=".0"/><path d="M15.5 8.5a5 5 0 0 0-7 7"/>',
  zone: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><circle cx="17" cy="17" r="3.5"/>',
  live: '<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="m8.5 3.5 3.5 3.5 3.5-3.5"/><circle cx="12" cy="13.25" r="2.25"/>',
  vip: '<path d="M4 8.5l4 3.5 4-6 4 6 4-3.5-1.6 9.5H5.6z"/>',
  creator: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  upload: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10h17M16 14.5h1.5"/>',
  exit: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
};

export function fmtCount(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
  return String(n);
}

export function fmtDuration(s: number): string {
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

export function fmtAgo(ts: number): string {
  if (!ts) return '';
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  const t = new Date(ts * 1000);
  return `${t.getFullYear() === new Date().getFullYear() ? '' : `${t.getFullYear()}-`}${t.getMonth() + 1}-${t.getDate()}`;
}

/** 按自然日分组的标签：今天 / 昨天 / 本周/ 更早（或具体日期） */
export function dayBucket(ts: number, exact = false): string {
  if (!ts) return '更早';
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(Date.now()) - day(ts * 1000)) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (exact) { const t = new Date(ts * 1000); return `${t.getMonth() + 1} 月 ${t.getDate()} 日`; }
  return diff < 7 ? '本周' : '更早';
}
