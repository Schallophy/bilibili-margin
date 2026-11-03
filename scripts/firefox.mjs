// Firefox 版：在 dist/ 的基础上生成 dist-firefox/ 和 margin-firefox.zip。
// 代码完全相同，只改 manifest：
// · Firefox 的 MV3 后台不支持 service_worker，改成事件页 background.scripts（background.js 本来就是 IIFE）
// · 加 gecko 扩展 ID、最低版本 140（ESR；数据收集声明从 140 起支持，内容脚本站点权限也在安装时授予）
// · 按 AMO 要求声明数据收集：天气用 IP 粗定位城市（ipwho.is / Open-Meteo），关掉天气就不再发送
import { cp, rm, readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

await rm('dist-firefox', { recursive: true, force: true });
await cp('dist', 'dist-firefox', { recursive: true });
const m = JSON.parse(await readFile('dist-firefox/manifest.json', 'utf8'));
m.background = { scripts: ['background.js'] };
m.browser_specific_settings = {
  gecko: {
    id: 'margin@jiuyang5354.github.io',
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['locationInfo'] },
  },
};
await writeFile('dist-firefox/manifest.json', JSON.stringify(m, null, 2) + '\n');
execSync('rm -f ../margin-firefox.zip && zip -qrX ../margin-firefox.zip .', { cwd: 'dist-firefox', stdio: 'inherit' });
console.log('built → dist-firefox/ + margin-firefox.zip');
