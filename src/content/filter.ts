import type { Filters } from '../shared/settings';

/** 所有可过滤内容的统一形状；拿不到的字段必须是 null/undefined，不能当作 0 */
export interface FilterTarget {
  title: string;
  author?: string | null;
  mid?: number | null;
  /** 播放量；未知时为 null/undefined */
  views?: number | null;
  /** 秒；未知时为 null/undefined */
  duration?: number | null;
  /** 接口明确标记的广告 */
  ad?: boolean;
}

/** 返回 true 表示保留 */
export type Predicate = (t: FilterTarget) => boolean;

function keywordTest(k: string): ((s: string) => boolean) | null {
  const t = k.trim();
  if (!t) return null;
  const m = /^\/(.+)\/([a-z]*)$/.exec(t);
  if (m) {
    try {
      const re = new RegExp(m[1], m[2].includes('i') ? m[2] : `${m[2]}i`);
      // 带 g/y 的正则 test() 会推进 lastIndex，同一个关键词第二次就可能匹配失败
      return (s) => { re.lastIndex = 0; return re.test(s); };
    } catch { return null; }
  }
  const low = t.toLowerCase();
  return (s) => s.toLowerCase().includes(low);
}

export function compileFilter(f: Filters): Predicate {
  const kws = f.keywords.map(keywordTest).filter(Boolean) as ((s: string) => boolean)[];
  const mids = new Set<number>();
  const names = new Set<string>();
  for (const u of f.ups) {
    const t = u.trim();
    if (/^\d+$/.test(t)) mids.add(Number(t));
    else if (t) names.add(t.toLowerCase());
  }
  return (t) => {
    if (kws.some((k) => k(t.title))) return false;
    if (t.mid != null && mids.has(t.mid)) return false;
    if (t.author && names.has(t.author.toLowerCase())) return false;
    // 未知播放量 / 时长放行：历史、稍后再看、动态、私信卡片没有这些字段
    if (f.minViews > 0 && t.views != null && t.views < f.minViews) return false;
    // 0 / null 都按「未知时长」放行；和旧版逐项过滤的行为一致
    if (f.minDuration > 0 && t.duration != null && t.duration > 0 && t.duration < f.minDuration) return false;
    return true;
  };
}

/**
 * 动态过滤（v0.47.2，GitHub #8：装了扩展后油猴的动态净化用不了）：
 * 沿用设置里首页的「屏蔽关键词 / 屏蔽 UP」，匹配动态正文、标题、视频标题和转发的原动态。
 */
export interface DynLike { author: string; mid: number; title?: string; text?: string; video?: { title: string } | null; article?: { title: string } | null; orig?: DynLike | null }
export function compileDynFilter(f: Filters): (d: DynLike) => boolean {
  const kws = f.keywords.map(keywordTest).filter(Boolean) as ((s: string) => boolean)[];
  const mids = new Set<number>();
  const names = new Set<string>();
  for (const u of f.ups) {
    const t = u.trim();
    if (/^\d+$/.test(t)) mids.add(Number(t));
    else if (t) names.add(t.toLowerCase());
  }
  if (!kws.length && !mids.size && !names.size) return () => true;
  const hay = (d: DynLike): string => [d.title, d.text, d.video?.title, d.article?.title, d.orig ? hay(d.orig) : ''].filter(Boolean).join('\n');
  const upOk = (d: DynLike) => !mids.has(d.mid) && !names.has(String(d.author).toLowerCase());
  return (d) => upOk(d) && (!d.orig || upOk(d.orig)) && !kws.some((k) => k(hay(d)));
}
