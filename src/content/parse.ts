/** 从「12.3万」「1.2亿」「1234」这类文本解析播放量；解析不到返回 null */
export function parseCountText(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, ' ');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(万|亿)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2] === '万' ? 1e4 : m[2] === '亿' ? 1e8 : 1));
}

/** 从「[h:]m:ss」解析秒数；解析不到返回 null */
export function parseDurationText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1] || 0), mm = Number(m[2]), ss = Number(m[3]);
  if (!Number.isFinite(h + mm + ss)) return null;
  return h * 3600 + mm * 60 + ss;
}
