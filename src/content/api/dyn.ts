/* eslint-disable @typescript-eslint/no-explicit-any */
import { getJSON } from './http';

/** 一条动态，抽成渲染需要的最小结构 */
export interface Dyn {
  id: string; type: string; author: string; face: string; mid: number; ts: number; time: string;
  text: string; title?: string;
  video?: { bvid: string; title: string; cover: string; dur: string; play: string; desc: string; ad?: boolean };
  pics: string[];
  article?: { title: string; cover: string; desc: string; url: string };
  /** 直播（开播提醒 LIVE_RCMD / 直播间分享 LIVE），#4 */
  live?: { title: string; cover: string; url: string; on: boolean; meta: string };
  /** 其它带卡片的类型（合集、番剧、课程、音乐、通用卡片），统一成链接卡 */
  link?: { title: string; cover: string; desc: string; url: string; kind: string };
  orig?: Dyn | null;
  stat: { comment: number; forward: number; like: number };
  url: string;
}

const https = (u: unknown) => String(u ?? '').replace(/^\/\//, 'https://').replace(/^http:/, 'https:');

export function toDyn(it: any): Dyn | null {
  if (!it?.modules) return null;
  const m = it.modules, a = m.module_author ?? {}, d = m.module_dynamic ?? {}, s = m.module_stat ?? {};
  const major = d.major ?? {};
  const opus = major.opus;
  const text = (opus?.summary?.text ?? d.desc?.text ?? '').trim();
  const out: Dyn = {
    id: it.id_str, type: it.type, author: a.name ?? '', face: https(a.face), mid: a.mid ?? 0, ts: a.pub_ts ?? 0, time: a.pub_time ?? '',
    text, title: opus?.title || undefined, pics: [],
    stat: { comment: s.comment?.count ?? 0, forward: s.forward?.count ?? 0, like: s.like?.count ?? 0 },
    url: `https://www.bilibili.com/opus/${it.id_str}`,
  };
  if (major.archive) {
    const v = major.archive;
    const ad = v.is_ad === true || Boolean(v.ad_info) || Boolean(v.business_info) || undefined;
    out.video = { bvid: v.bvid, title: v.title, cover: https(v.cover), dur: v.duration_text ?? '', play: v.stat?.play ?? '', desc: v.desc ?? '', ad };
    out.url = `https://www.bilibili.com/video/${v.bvid}`;
  }
  if (opus?.pics) out.pics = opus.pics.map((p: any) => https(p.url));
  else if (major.draw?.items) out.pics = major.draw.items.map((p: any) => https(p.src));
  if (major.article) {
    const r = major.article;
    out.article = { title: r.title, cover: https(r.covers?.[0]), desc: r.desc ?? '', url: https(r.jump_url) };
  }
  if (major.live_rcmd) {
    let c: any = {};
    try { c = JSON.parse(major.live_rcmd.content || '{}'); } catch { /* ignore */ }
    const li = c.live_play_info ?? {};
    const url = https(li.link || (li.room_id ? `https://live.bilibili.com/${li.room_id}` : ''));
    out.live = { title: li.title ?? '', cover: https(li.cover), url, on: li.live_status === 1 || c.live_status === 1 || !!li.live_start_time, meta: [li.area_name, li.watched_show?.text_large].filter(Boolean).join(' · ') };
    if (url) out.url = url;
  } else if (major.live) {
    const l = major.live;
    out.live = { title: l.title ?? '', cover: https(l.cover), url: https(l.jump_url), on: l.live_state === 1, meta: [l.desc_first, l.desc_second].filter(Boolean).join(' · ') };
    if (out.live.url) out.url = out.live.url;
  }
  const lk = major.ugc_season ?? major.pgc ?? major.courses ?? major.music ?? major.common;
  if (!out.video && !out.live && !out.article && lk) {
    const kind = major.ugc_season ? '合集' : major.pgc ? '番剧' : major.courses ? '课程' : major.music ? '音乐' : (lk.badge?.text || '');
    out.link = { title: lk.title ?? '', cover: https(lk.cover), desc: lk.desc ?? lk.sub_title ?? lk.label ?? '', url: https(lk.jump_url), kind };
    if (out.link.url) out.url = out.link.url;
  }
  if (it.orig) out.orig = toDyn(it.orig);
  return out;
}

export async function spaceDynamics(mid: number, offset: string): Promise<{ list: Dyn[]; offset: string; more: boolean }> {
  const d = await getJSON<any>('/x/polymer/web-dynamic/v1/feed/space', { host_mid: mid, offset, timezone_offset: -480, features: 'itemOpusStyle' });
  return { list: (d.items ?? []).map(toDyn).filter(Boolean) as Dyn[], offset: d.offset ?? '', more: !!d.has_more };
}

export type FeedType = 'all' | 'video' | 'pgc' | 'article';
/** 关注动态流；hostMid 只看某个 UP */
export async function followFeed(type: FeedType, offset: string, hostMid = 0): Promise<{ list: Dyn[]; offset: string; more: boolean; baseline: string }> {
  const p: Record<string, string | number> = { type, offset, timezone_offset: -480, features: 'itemOpusStyle' };
  if (hostMid) p.host_mid = hostMid;
  const d = await getJSON<any>('/x/polymer/web-dynamic/v1/feed/all', p);
  return { list: (d.items ?? []).map(toDyn).filter(Boolean) as Dyn[], offset: d.offset ?? '', more: !!d.has_more, baseline: d.update_baseline ?? '' };
}

export interface Up { mid: number; name: string; face: string; fresh: boolean }
export interface LiveUp { mid: number; name: string; face: string; title: string; url: string }
/** 顶部「最常访问」头像条 + 正在直播 */
export async function portal(): Promise<{ ups: Up[]; live: LiveUp[]; liveCount: number }> {
  const d = await getJSON<any>('/x/polymer/web-dynamic/v1/portal');
  const ups = (d.up_list?.items ?? []).map((u: any) => ({ mid: u.mid, name: u.uname, face: https(u.face), fresh: !!u.has_update }));
  const live = (d.live_users?.items ?? []).map((u: any) => ({ mid: u.mid, name: u.uname, face: https(u.face), title: u.title ?? '', url: https(u.jump_url || `https://live.bilibili.com/${u.room_id}`) }));
  return { ups, live, liveCount: d.live_users?.count ?? live.length };
}
