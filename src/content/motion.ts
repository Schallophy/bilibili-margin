/** 减少动画的统一判断：用户设置（html.margin-reduce）或系统偏好任一为真 */
const MQ = matchMedia('(prefers-reduced-motion: reduce)');
const EVENT = 'margin:motion';

export const prefersReducedMotion = (): boolean => MQ.matches;

export const userReducedMotion = (): boolean =>
  document.documentElement.classList.contains('margin-reduce');

export const reducedMotion = (): boolean => userReducedMotion() || prefersReducedMotion();

/** 由入口脚本在设置加载 / 变化时调用；只有真正变化才通知订阅者 */
export function setUserReducedMotion(on: boolean): void {
  const de = document.documentElement;
  const had = de.classList.contains('margin-reduce');
  de.classList.toggle('margin-reduce', on);
  if (had !== on) de.dispatchEvent(new CustomEvent(EVENT, { bubbles: true }));
}

/** 订阅用户开关或系统偏好的变化。页面级组件常驻到页面卸载，无需清理。 */
export function onMotionChange(fn: () => void): void {
  document.addEventListener(EVENT, fn);
  MQ.addEventListener('change', fn);
}
