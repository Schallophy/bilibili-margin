import { every } from '../sched';
// B 站原生评论（bili-comments，lit 组件，多层 open shadow root）外层 CSS 进不去：
// 找到关键组件后往它们的 shadowRoot 里追加一张样式表，变量从 html 继承（--m-*）。
const SKINS: Record<string, string> = {
  'bili-comments-header-renderer': `
    #navbar { align-items: center !important; margin: 0 0 20px !important; padding-top: 0 !important; }
    #title { display: flex !important; align-items: baseline !important; gap: 8px !important; }
    #title h2 { margin: 0 !important; font: 400 24px/1.2 var(--m-serif, serif) !important; letter-spacing: .04em !important; color: var(--m-ink) !important; }
    #count { font: 400 13px/1 var(--m-mono, monospace) !important; color: var(--m-faint) !important; margin: 0 !important; }
    #sort-actions { display: inline-flex !important; align-items: center !important; gap: 2px !important; margin-left: 20px !important; padding: 3px !important; border-radius: 999px !important; background: var(--m-chip) !important; box-shadow: var(--ring) !important; }
    #sort-actions .sort-div { display: none !important; }
    #sort-actions bili-text-button { display: inline-flex; align-items: center; height: 28px; padding: 0 14px; border-radius: 999px; font-size: 13px; color: var(--m-muted); --bili-text-button-color: var(--m-muted); --bili-text-button-hover-color: var(--m-ink); cursor: pointer; transition: background .2s, color .2s, box-shadow .2s; }
    #sort-actions bili-text-button:hover { color: var(--m-ink); }
    #sort-actions.hot bili-text-button:first-of-type, #sort-actions:not(.hot) bili-text-button:last-of-type { background: var(--m-surface); color: var(--m-ink); --bili-text-button-color: var(--m-ink); box-shadow: var(--ring), var(--sh-xs); }
    #disabled-commentbox #edit { border: 0 !important; border-radius: 14px !important; background: var(--m-chip) !important; box-shadow: var(--ring) !important; color: var(--m-muted) !important; }
    #disabled-commentbox #edit button { border-radius: 999px !important; }
  `,
  'bili-comment-box': `
    #editor { background: var(--m-chip) !important; border: 0 !important; border-radius: 14px !important; box-shadow: var(--ring) !important; padding: 10px 14px !important; transition: box-shadow .2s, background .2s !important; }
    #editor:hover { background: color-mix(in srgb, var(--m-ink) 7%, transparent) !important; }
    #editor:focus-within, #editor.active { background: var(--m-surface) !important; box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--m-accent) 55%, transparent), var(--sh-xs) !important; }
    #footer .tool-btn { border-radius: 8px !important; }
    #pub button { border-radius: 999px !important; padding: 0 18px !important; }
  `,
  'bili-comment-rich-textarea': `
    #input, .brt-root, .brt-editor { background: transparent !important; color: var(--m-ink) !important; font-size: 14px !important; line-height: 1.6 !important; }
    .brt-placeholder, [data-placeholder]::before { color: var(--m-faint) !important; }
  `,
};

const done = new WeakSet<ShadowRoot>();
let extra: Record<string, string> = {};
const sheets = new Map<string, CSSStyleSheet>();

function skin(root: ParentNode, depth = 0): void {
  if (depth > 6) return;
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const sr = el.shadowRoot;
    if (!sr) continue;
    const tag = el.tagName.toLowerCase();
    const css = SKINS[tag] ? SKINS[tag] + (extra[tag] ?? '') : undefined;
    if (css && !done.has(sr)) {
      let s = sheets.get(tag);
      if (!s) { s = new CSSStyleSheet(); s.replaceSync(css); sheets.set(tag, s); }
      sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, s];
      done.add(sr);
    }
    // 只往评论头部 / 输入框所在的层级钻，不遍历每条评论（数量多）
    if (tag === 'bili-comments' || tag === 'bili-comments-header-renderer' || tag === 'bili-comment-box') skin(sr, depth + 1);
  }
}

/** extra：按页面追加到某个组件皮肤后面的样式（详情页隐藏评论区重复的大标题） */
export function skinComments(more: Record<string, string> = {}): void {
  enterToSend();
  extra = more;
  const run = () => { const bc = document.querySelector('bili-comments'); if (bc) skin(bc.parentElement ?? document); };
  // 前 90 秒每秒补一次（评论区是懒加载的 Web Components）；页面隐藏时暂停
  let n = 0;
  const stop = every(1000, () => { run(); if (++n > 90) stop(); });
  let pending = 0;
  addEventListener('scroll', () => { if (pending) return; pending = window.setTimeout(() => { pending = 0; run(); }, 400); }, { passive: true });
}

/**
 * 回车直接发评论（v0.47.4，用户要求）：B 站原生评论框里回车只换行，要点「发布」。
 * 改成：回车发送，Shift+回车换行；输入法选字中（isComposing / keyCode 229）、正在打 @ 某人时不发送，交给原生处理。
 * 评论框在多层 shadow root 里，用 composedPath 找到所在的 bili-comment-box，再点它自己的发布按钮。
 */
let enterHooked = false;
export function enterToSend(): void {
  if (enterHooked) return;
  enterHooked = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.keyCode === 229) return;
    const path = e.composedPath();
    const editable = path.find((n): n is HTMLElement => n instanceof HTMLElement && (n.isContentEditable || n.tagName === 'TEXTAREA'));
    if (!editable) return;
    const box = path.find((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === 'BILI-COMMENT-BOX');
    if (!box?.shadowRoot) return;
    const text = (editable as HTMLTextAreaElement).value ?? editable.innerText ?? '';
    if (!text.trim()) return;
    // 正在输入 @用户名：回车留给原生的候选列表
    const sel = (editable.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? getSelection();
    const before = sel && sel.anchorNode ? (sel.anchorNode.textContent ?? '').slice(0, sel.anchorOffset) : '';
    if (/@[^\s@]{0,20}$/.test(before)) return;
    const btn = box.shadowRoot.querySelector<HTMLElement>('#pub button') ?? box.shadowRoot.querySelector<HTMLElement>('#pub');
    if (!btn || btn.hasAttribute('disabled')) return;
    e.preventDefault();
    e.stopPropagation();
    btn.click();
  }, true);
}
