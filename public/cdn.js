// 映间 MARGIN · 视频 CDN 节点（v0.47.2，评论区：想像 bilisail 那样手动选节点）
// 运行在页面主环境（MAIN world），document_start。设置里选好的节点由内容脚本写进 localStorage['margin:cdn']；
// 为空就什么都不做。只改 playurl 返回里视频 / 音频流的主机名，路径和签名参数原样保留。
(() => {
  let host = '';
  try { host = localStorage.getItem('margin:cdn') || ''; } catch (e) { /* 读不到就不改 */ }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(bilivideo\.com|bilivideo\.cn|akamaized\.net)$/.test(host)) return;
  if (sessionStorage.getItem('margin:off')) return;

  const upos = (u) => { try { const x = new URL(u); return x.pathname.includes('/upgcxcode/') && !/mcdn\.bilivideo\.cn$|szbdyd\.com$/.test(x.hostname); } catch (e) { return false; } };
  const swap = (u) => { try { const x = new URL(u); x.hostname = host; x.port = ''; x.protocol = 'https:'; return x.toString(); } catch (e) { return u; } };
  // 一条流：取第一个 upos 地址（主地址是 PCDN 时就用备用里的）改成选中的主机
  const fixStream = (s) => {
    if (!s || typeof s !== 'object') return;
    for (const [main, back] of [['baseUrl', 'backupUrl'], ['base_url', 'backup_url'], ['url', 'backup_url']]) {
      if (typeof s[main] !== 'string') continue;
      const all = [s[main], ...(Array.isArray(s[back]) ? s[back] : [])];
      const ok = all.find(upos);
      if (!ok) continue;
      s[main] = swap(ok);
      // 原来的地址全部留作备用：选的节点连不上时播放器会自己退回去
      if (Array.isArray(s[back])) s[back] = all;
    }
  };
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 8) return;
    if (o.dash && typeof o.dash === 'object') {
      for (const k of ['video', 'audio']) (o.dash[k] || []).forEach(fixStream);
      (o.dash.dolby?.audio || []).forEach(fixStream);
      if (o.dash.flac?.audio) fixStream(o.dash.flac.audio);
    }
    if (Array.isArray(o.durl)) o.durl.forEach(fixStream);
    for (const v of Object.values(o)) if (v && typeof v === 'object' && v !== o.dash) walk(v, d + 1);
  };
  const isPlay = (u) => /\/(x\/player\/(wbi\/)?playurl|pgc\/player\/web\/(v2\/)?playurl|ogv\/player\/playview|x\/player\/online\/playurl)/.test(String(u));
  const rewrite = (text) => { try { const j = JSON.parse(text); walk(j); return JSON.stringify(j); } catch (e) { return text; } };

  // 首屏：页面内联的 window.__playinfo__
  let pi;
  try {
    Object.defineProperty(window, '__playinfo__', { configurable: true, get: () => pi, set: (v) => { try { walk(v); } catch (e) { /* 保持原样 */ } pi = v; } });
  } catch (e) { /* 已被定义 */ }

  // 切集 / 换清晰度：fetch 与 XHR
  const of = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    const p = of.apply(this, arguments);
    if (!isPlay(url)) return p;
    return p.then(async (r) => {
      try { const t = rewrite(await r.clone().text()); return new Response(t, { status: r.status, statusText: r.statusText, headers: r.headers }); } catch (e) { return r; }
    });
  };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__mgPlay = isPlay(u); return XO.apply(this, arguments); };
  const desc = (k) => Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, k);
  const rt = desc('responseText'), rs = desc('response');
  Object.defineProperty(XMLHttpRequest.prototype, 'responseText', { configurable: true, get() {
    const v = rt.get.call(this);
    if (!this.__mgPlay || this.readyState !== 4) return v;
    if (this.__mgOut === undefined) this.__mgOut = rewrite(v);
    return this.__mgOut;
  } });
  Object.defineProperty(XMLHttpRequest.prototype, 'response', { configurable: true, get() {
    const v = rs.get.call(this);
    if (!this.__mgPlay || this.readyState !== 4) return v;
    if (typeof v === 'string') return this.responseText;
    if (v && typeof v === 'object' && !(v instanceof ArrayBuffer) && !(v instanceof Blob)) { if (!this.__mgObj) { walk(v); this.__mgObj = true; } return v; }
    return v;
  } });
})();
