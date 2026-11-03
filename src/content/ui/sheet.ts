import { h, icon, ICONS } from './dom';

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/** 从右侧滑入的玻璃抽屉（参考 21st「Sheet」的交互，原生重写） */
export function createSheet(opts: { title: string; eyebrow: string; width?: number; onOpen?: () => void }): Sheet {
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'sheet-x', title: '关闭', 'aria-label': '关闭' }, icon(ICONS.close));
  const panel = h('aside', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title, tabindex: -1, style: `--w:${opts.width ?? 420}px` },
    h('header', { class: 'sheet-head' }, h('div', {}, h('div', { class: 'eyebrow' }, h('span', { class: 'en' }, opts.eyebrow)), h('h2', {}, opts.title)), closeBtn),
    body,
  );
  const scrim = h('div', { class: 'scrim' });
  const el = h('div', { class: 'sheet-layer', 'data-open': 'false' }, scrim, panel);
  // 关着的时候整层 inert：里面的控件不进 Tab 顺序、读屏也跳过
  el.inert = true;
  let last: Element | null = null;

  const api: Sheet = {
    el, body,
    open() {
      if (api.isOpen()) return;
      last = (el.getRootNode() as ShadowRoot).activeElement;
      el.dataset.open = 'true';
      el.inert = false;
      opts.onOpen?.();
      el.dispatchEvent(new CustomEvent('margin:sheet', { bubbles: true }));
      requestAnimationFrame(() => panel.focus({ preventScroll: true }));
    },
    close() {
      if (!api.isOpen()) return;
      el.dataset.open = 'false';
      el.inert = true;
      el.dispatchEvent(new CustomEvent('margin:sheet', { bubbles: true }));
      (last as HTMLElement | null)?.focus?.({ preventScroll: true });
    },
    isOpen: () => el.dataset.open === 'true',
  };
  scrim.addEventListener('click', api.close);
  closeBtn.addEventListener('click', api.close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && api.isOpen()) api.close(); });
  return api;
}
