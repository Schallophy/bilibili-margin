/**
 * 弹幕空降（移植自 Bilibili-Evolved 的「启用弹幕空降」组件，作者 kdxcxs，MIT）：
 * 给「03:20」「空降 2:15」这类弹幕加下划线，点一下就跳到对应时间。
 * 只在 www.bilibili.com 的播放页生效；跳转用原生 video 的 currentTime，不碰播放器内部接口。
 */
import { parseAirborneTime } from './danmaku-time';
import { every } from './sched';

/** 播放器把弹幕渲染成 DOM 节点的容器：新版 bpx 播放器，以及老版播放器的普通/高级/BAS 弹幕层 */
const containers = ['.bpx-player-row-dm-wrap', '.bilibili-player-video-danmaku', '.bilibili-player-video-adv-danmaku', '.bilibili-player-video-bas-danmaku'];
/** 单条弹幕的 class，新旧播放器不一样 */
const danmakuTokens = ['bili-danmaku-x-dm', 'b-danmaku', 'bili-dm'];
const danmakuSelector = danmakuTokens.map((t) => `.${t}`).join(',');
/** 认得出时间的弹幕挂这个 class，下划线、光标和点击命中都跟着它走 */
const MARK = 'margin-dm-air';
const videoSelector = '.bpx-player-video-wrap video, .bpx-player-container video, #bilibili-player video';

let stop: (() => void) | null = null;

/** 只有这些页面有带弹幕的播放器；别的页面不扫描，省掉每秒的查询 */
const hasPlayerPage = (): boolean =>
  location.hostname === 'www.bilibili.com' && /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?(?:video\/|bangumi\/play\/|list\/|festival\/|cheese\/play\/|s\/video\/)/.test(location.pathname);

/** 单条弹幕：认得出时间就挂标记，认不出就摘掉（弹幕元素会被复用，文字会变） */
function markOne(el: HTMLElement): void {
  el.classList.toggle(MARK, !Number.isNaN(parseAirborneTime(el.textContent)));
}

/** 从点击目标往上找被标记的弹幕 */
function danmakuFrom(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(`.${MARK}`) : null;
}

/** 跳到指定秒；弹幕时间轴和视频总长可能对不齐，夹在 [0, 时长) 之内 */
function seekTo(time: number): void {
  const v = document.querySelector<HTMLVideoElement>(videoSelector);
  if (!v) return;
  const end = Number.isFinite(v.duration) && v.duration > 0 ? Math.max(0, v.duration - 0.5) : time;
  v.currentTime = Math.min(Math.max(time, 0), end);
}

/** 开关弹幕空降：开时扫描播放器的弹幕层并挂点击监听，关时全部撤掉 */
export function setDanmakuAirborne(enabled: boolean): void {
  if (!enabled) {
    stop?.();
    stop = null;
    return;
  }
  if (stop) return;
  const observers = new Map<Element, MutationObserver>();

  const onMutations = (records: MutationRecord[]): void => {
    const touched = new Set<HTMLElement>();
    for (const r of records) {
      if (r.type === 'characterData') {
        // 弹幕元素被复用时只换里面的文字节点
        const owner = r.target.parentElement?.closest<HTMLElement>(danmakuSelector);
        if (owner) touched.add(owner);
        continue;
      }
      if (!(r.target instanceof Element)) continue;
      const owner = r.target.closest<HTMLElement>(danmakuSelector);
      if (owner) touched.add(owner);
      for (const node of r.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(danmakuSelector)) touched.add(node as HTMLElement);
        else node.querySelectorAll<HTMLElement>(danmakuSelector).forEach((d) => touched.add(d));
      }
    }
    touched.forEach(markOne);
  };

  const attach = (container: Element): void => {
    if (observers.has(container)) return;
    const ob = new MutationObserver(onMutations);
    ob.observe(container, { childList: true, subtree: true, characterData: true });
    observers.set(container, ob);
    // 容器里可能已经有弹幕了（切分P、开关弹幕之后的回来）
    container.querySelectorAll<HTMLElement>(danmakuSelector).forEach(markOne);
  };

  /** 播放器会在切 P / 切清晰度时重建弹幕层，所以每秒对一次账 */
  const sync = (): void => {
    if (!hasPlayerPage()) {
      observers.forEach((ob, container) => {
        ob.disconnect();
        observers.delete(container);
      });
      return;
    }
    const found = new Set<Element>();
    for (const sel of containers) document.querySelectorAll(sel).forEach((c) => found.add(c));
    observers.forEach((ob, container) => {
      if (found.has(container)) return;
      ob.disconnect();
      observers.delete(container);
    });
    found.forEach(attach);
  };

  const onClick = (e: MouseEvent): void => {
    const el = danmakuFrom(e.target);
    if (!el) return;
    const time = parseAirborneTime(el.textContent);
    if (Number.isNaN(time)) return;
    // 点弹幕只是为了跳，不该顺带把播放器暂停
    e.preventDefault();
    e.stopPropagation();
    seekTo(time);
  };

  // 弹幕层整体不吃指针事件，只有标记过的那几条能接住点击，所以监听挂在 document 上
  document.addEventListener('click', onClick, true);
  sync();
  const cancel = every(1000, sync);
  stop = () => {
    cancel();
    document.removeEventListener('click', onClick, true);
    observers.forEach((ob) => ob.disconnect());
    observers.clear();
    document.querySelectorAll(`.${MARK}`).forEach((el) => el.classList.remove(MARK));
  };
}
