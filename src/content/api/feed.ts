import { getJSON, getWbi, postForm } from './http';

export interface Video {
  bvid: string;
  cid: number;
  title: string;
  cover: string;
  duration: number;
  author: string;
  mid: number;
  face: string;
  views: number;
  danmaku: number;
  pubdate: number;
  reason?: string;
  /** 推荐接口才有（v0.46「不感兴趣」用） */
  aid?: number;
  trackId?: string;
  goto?: string;
  /** 接口明确标记的广告/推广（v0.47），不靠标题猜测 */
  ad?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const isAd = (v: any): boolean =>
  v.is_ad === true || v.card_type === 'ad' || v.goto === 'ad' || Boolean(v.ad_info);

const toVideo = (v: any): Video => ({
  bvid: v.bvid,
  cid: Number(v.cid) || 0,
  title: v.title,
  cover: String(v.pic || '').replace(/^http:/, 'https:'),
  duration: Number(v.duration) || 0,
  author: v.owner?.name ?? '',
  mid: v.owner?.mid ?? 0,
  face: v.owner?.face ?? '',
  views: v.stat?.view ?? 0,
  danmaku: v.stat?.danmaku ?? 0,
  pubdate: v.pubdate ?? 0,
  reason: v.rcmd_reason?.content || undefined,
  aid: Number(v.id ?? v.aid) || undefined,
  trackId: v.track_id || undefined,
  goto: v.goto || undefined,
  ad: isAd(v) || undefined,
});

/**
 * 「不感兴趣」反馈给 B 站推荐（v0.46，B 站评论：点了不喜欢还一直推）。
 * 与 B 站首页自己的按钮用同一个接口和参数：reason 1 = 内容不感兴趣，4 = 不想看此 UP 主。
 */
export async function dislike(v: Video, reason: 1 | 4, cancel = false): Promise<void> {
  if (!v.aid) throw new Error('这条视频不支持');
  await postForm(cancel ? '/x/web-interface/feedback/dislike/cancel' : '/x/web-interface/feedback/dislike', {
    app_id: 100, platform: 5, from_spmid: '', spmid: '333.1007.0.0',
    goto: v.goto || 'av', id: v.aid, mid: v.mid, track_id: v.trackId || '', feedback_page: 1, reason_id: reason,
  });
}

export async function recommended(round: number): Promise<Video[]> {
  const data = await getWbi<{ item: any[] }>('/x/web-interface/wbi/index/top/feed/rcmd', {
    web_location: 1430650,
    feed_version: 'V8',
    homepage_ver: 1,
    fresh_type: 4,
    y_num: 4,
    last_y_num: 5,
    ps: 12,
    fresh_idx: round,
    fresh_idx_1h: round,
    brush: round,
  });
  return (data.item || []).filter((v) => v.goto === 'av' && v.bvid).map(toVideo);
}

export async function popular(page: number): Promise<{ list: Video[]; done: boolean }> {
  const data = await getJSON<{ list: any[]; no_more: boolean }>('/x/web-interface/popular', { ps: 20, pn: page });
  return { list: (data.list || []).map(toVideo), done: data.no_more };
}
