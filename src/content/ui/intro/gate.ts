/** 开场动画播放期间，首页底下被完全遮住的动画（背景、天气、小电视眼睛）先睡着，让出 GPU / 主线程 */
let active = false;
const subs = new Set<() => void>();
export const introActive = (): boolean => active;
export function setIntroActive(v: boolean): void {
  active = v;
  if (!v) { const fs = [...subs]; subs.clear(); fs.forEach((f) => { try { f(); } catch { /* ignore */ } }); }
}
/** 开场结束（开始淡出）时调用一次 */
export function onIntroEnd(f: () => void): void { if (!active) f(); else subs.add(f); }

export const SESSION_KEY = 'margin:intro-played';

/** 这次要不要放开场：每个浏览器会话一次；用户减少动画或系统减少动态效果时不放 */
export function shouldPlayIntro(enabled: boolean, userReduced = false): boolean {
  if (!enabled || userReduced) return false;
  try { if (sessionStorage.getItem(SESSION_KEY) && !localStorage.getItem('margin:intro-always')) return false; } catch { /* ignore */ }
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

