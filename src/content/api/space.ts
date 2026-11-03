/* eslint-disable @typescript-eslint/no-explicit-any */
import { getJSON, getWbi } from './http';
import type { Video } from './feed';

export interface SpaceInfo {
  mid: number; name: string; face: string; sign: string; level: number;
  banner: string; official: string; vip: string; following: number; follower: number;
  likes: number; views: number; isFollowing: boolean; videoCount: number;
}

/** 图片地址补全：// 开头、http:、以及 acc/info 老字段 top_photo 那种不带域名的 bfs/space/xxx.png（v0.47：空间头图不显示） */
const https = (u: unknown) => {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^bfs\//.test(s) || /^\/bfs\//.test(s)) return `https://i0.hdslb.com/${s.replace(/^\//, '')}`;
  return s.replace(/^\/\//, 'https://').replace(/^http:/, 'https:');
};

export async function spaceInfo(mid: number): Promise<SpaceInfo> {
  const [acc0, rel, up, nav] = await Promise.all([
    getWbi<any>('/x/space/wbi/acc/info', { mid }).catch((e) => { console.warn('[MARGIN] acc/info', e); return null; }),
    getJSON<any>('/x/relation/stat', { vmid: mid }).catch(() => null),
    getJSON<any>('/x/space/upstat', { mid }).catch(() => null),
    getJSON<any>('/x/space/navnum', { mid }).catch(() => null),
  ]);
  // acc/info 被风控（-352 / -403）时退回 web-interface/card：名字、头像、签名、头图都有（v0.47）
  let acc = acc0;
  let card: any = null;
  if (!acc?.name || !(acc.top_photo_v2?.l_img || acc.top_photo)) card = await getJSON<any>('/x/web-interface/card', { mid, photo: 'true' }).catch(() => null);
  if (!acc?.name) {
    const c = card?.card;
    if (!c) throw new Error('资料接口暂时不可用');
    acc = { name: c.name, face: c.face, sign: c.sign, level: c.level_info?.current_level, official: { title: c.Official?.title }, vip: c.vip, is_followed: card.following };
  }
  const banner = acc.top_photo_v2?.l_img || acc.top_photo || card?.space?.l_img || card?.space?.s_img;
  return {
    mid, name: acc.name, face: https(acc.face), sign: acc.sign ?? '', level: acc.level ?? 0,
    banner: https(banner),
    official: acc.official?.title ?? '', vip: acc.vip?.label?.text ?? '',
    following: rel?.following ?? 0, follower: rel?.follower ?? 0,
    likes: up?.likes ?? 0, views: up?.archive?.view ?? 0,
    isFollowing: !!acc.is_followed, videoCount: nav?.video ?? 0,
  };
}

export type VideoOrder = 'pubdate' | 'click';

export async function spaceVideos(mid: number, pn: number, order: VideoOrder, keyword = ''): Promise<{ list: Video[]; total: number }> {
  const d = await getWbi<any>('/x/space/wbi/arc/search', { mid, ps: 30, pn, order, tid: 0, keyword, order_avoided: 'true', platform: 'web', web_location: 1550101 });
  const list: Video[] = (d.list?.vlist ?? []).map((v: any) => ({
    bvid: v.bvid, cid: 0, title: v.title, cover: https(v.pic), duration: parseLen(v.length),
    author: v.author, mid: v.mid, face: '', views: Number(v.play) || 0, danmaku: v.video_review ?? 0, pubdate: v.created ?? 0,
  }));
  return { list, total: d.page?.count ?? list.length };
}

/** 最近投币 / 最近点赞的视频（v0.47，评论区：主页下方没有最近投币和点赞了）。对方没公开时 B 站返回 53013，这里返回 null，界面就不显示那个标签 */
export type Recent = 'coin' | 'like';
export async function spaceRecent(mid: number, kind: Recent): Promise<Video[] | null> {
  const r = await fetch(`https://api.bilibili.com/x/space/${kind}/video?vmid=${mid}`, { credentials: 'include' });
  const j = await r.json().catch(() => null);
  if (!j || j.code !== 0) return null;
  const arr: any[] = Array.isArray(j.data) ? j.data : (j.data?.list ?? []);
  return arr.filter((v) => v && (v.bvid || v.aid)).map((v) => ({
    bvid: v.bvid || `av${v.aid}`, cid: v.cid ?? 0, title: v.title ?? '', cover: https(v.pic), duration: Number(v.duration) || 0,
    author: v.owner?.name ?? '', mid: v.owner?.mid ?? 0, face: https(v.owner?.face), views: v.stat?.view ?? 0, danmaku: v.stat?.danmaku ?? 0, pubdate: v.pubdate ?? 0,
  }));
}

function parseLen(s: string): number {
  return String(s || '').split(':').reduce((a, x) => a * 60 + (Number(x) || 0), 0);
}

/** 关注 / 取关（act 1 关注，2 取关） */
export async function follow(mid: number, on: boolean, csrf: string): Promise<boolean> {
  const body = new URLSearchParams({ fid: String(mid), act: on ? '1' : '2', re_src: '11', csrf });
  const r = await fetch('https://api.bilibili.com/x/relation/modify', { method: 'POST', credentials: 'include', body });
  const j = await r.json().catch(() => ({}));
  return j.code === 0;
}

/**
 * 「关注老片」（v0.47.2，评论区 wsxszzz：想看关注的 UP 以前的高播放视频）：
 * 每批随机挑 4 位关注的 UP，取各自「最多播放」第一页里发布超过 90 天的前 3 条，打乱后返回。
 * 关注列表只拉一次（最多 250 人），用完一轮就结束。
 */
let followPool: number[] | null = null;
export async function followClassics(me: number): Promise<{ list: Video[]; done: boolean }> {
  if (!followPool) {
    const mids: number[] = [];
    for (let pn = 1; pn <= 5; pn++) {
      const d = await getJSON<any>('/x/relation/followings', { vmid: me, pn, ps: 50, order: 'desc' }).catch(() => null);
      const l: any[] = d?.list ?? [];
      mids.push(...l.map((x) => Number(x.mid)).filter(Boolean));
      if (l.length < 50) break;
    }
    if (!mids.length) throw new Error('还没有关注的 UP 主，或关注列表不公开');
    followPool = mids.sort(() => Math.random() - 0.5);
  }
  const pick = followPool.splice(0, 4);
  const old = Date.now() / 1000 - 90 * 86400;
  const lists = await Promise.all(pick.map((mid, i) => new Promise<Video[]>((res) => setTimeout(() => spaceVideos(mid, 1, 'click').then((r) => res(r.list.filter((v) => v.pubdate && v.pubdate < old).slice(0, 3))).catch(() => res([])), i * 250))));
  const list = lists.flat().sort(() => Math.random() - 0.5);
  return { list, done: followPool.length === 0 };
}
export const resetClassics = () => { followPool = null; };
