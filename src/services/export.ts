/**
 * 一键导出 —— 「信任的地基」。
 *
 * 导出内容:一个 zip,内含
 *   locus_export/
 *     data.json     —— 全部记录的结构化数据(坐标转为 WGS84)
 *     index.html    —— 可直接用浏览器打开的可读时间线
 *     photos/       —— 所有照片原图
 *     audio/        —— 所有录音文件(若有)
 *
 * 实现:
 *  - 用 fflate 在内存里打 zip(纯 JS,无原生依赖)。
 *  - 用 expo-file-system 读照片/录音字节、写 zip 到缓存目录。
 *  - 用 expo-sharing 唤起系统分享。
 *  - 坐标存储为 GCJ-02,导出时转为国际通用 WGS84(见 utils/coords)。
 */
import {File, Paths} from 'expo-file-system';
import {strToU8, zipSync} from 'fflate';
import * as Sharing from 'expo-sharing';

import {getAllRecords} from '@/db/records';
import {gcj02ToWgs84} from '@/utils/coords';
import type {LocusRecord} from '@/models/record';

interface ExportItem {
  id: string;
  time: string;
  timestamp: number;
  location: {
    name: string;
    address: string;
    wgs84: {lat: number; lng: number};
  };
  note: string;
  photo: string;
  audio: string;
}

function toExportItem(r: LocusRecord): ExportItem {
  const {lat, lng} = gcj02ToWgs84(r.lat, r.lng);
  return {
    id: r.id,
    time: new Date(r.createdAt).toISOString(),
    timestamp: r.createdAt,
    location: {
      name: r.poiName,
      address: r.address,
      wgs84: {lat, lng},
    },
    note: r.note,
    photo: r.photoPath,
    audio: r.audioPath,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(items: ExportItem[]): string {
  const cards = items
    .map(it => {
      const date = new Date(it.timestamp).toLocaleString('zh-CN');
      const map = `https://uri.amap.com/marker?position=${it.location.wgs84.lng},${it.location.wgs84.lat}`;
      return `
      <article class="card">
        ${it.photo ? `<img src="${escapeHtml(it.photo)}" loading="lazy" />` : ''}
        <div class="meta">
          <div class="time">${escapeHtml(date)}</div>
          <div class="place">${escapeHtml(it.location.name || it.location.address)}</div>
          <p class="note">${escapeHtml(it.note)}</p>
          ${it.audio ? `<audio controls src="${escapeHtml(it.audio)}" style="width:100%;margin-top:8px"></audio>` : ''}
          <a class="coord" href="${map}" target="_blank">
            ${it.location.wgs84.lat.toFixed(6)}, ${it.location.wgs84.lng.toFixed(6)} (WGS84)
          </a>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>经纬 / Locus —— 我的世界线</title>
<style>
  body{font-family:-apple-system,system-ui,"PingFang SC",sans-serif;margin:0;background:#fafafa;color:#1a1a1a}
  header{padding:32px 20px;text-align:center}
  header h1{margin:0;font-size:22px;letter-spacing:2px}
  header p{color:#888;margin:6px 0 0;font-size:13px}
  main{max-width:680px;margin:0 auto;padding:0 16px 48px}
  .card{background:#fff;border-radius:14px;overflow:hidden;margin:16px 0;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .card img{width:100%;display:block;object-fit:cover;max-height:420px}
  .meta{padding:14px 16px}
  .time{font-size:12px;color:#999}
  .place{font-size:15px;font-weight:600;margin:2px 0 8px}
  .note{margin:0 0 8px;line-height:1.6;white-space:pre-wrap}
  .coord{font-size:12px;color:#3a6ea5;text-decoration:none}
</style>
</head>
<body>
  <header>
    <h1>经纬 · Locus</h1>
    <p>共 ${items.length} 个时空之点 · 导出于 ${new Date().toLocaleString('zh-CN')}</p>
  </header>
  <main>
    ${cards || '<p style="text-align:center;color:#999">还没有任何记录</p>'}
  </main>
</body>
</html>`;
}

export async function exportAll(): Promise<string> {
  const records = await getAllRecords();
  const items = records.map(toExportItem);

  const files: Record<string, Uint8Array> = {};
  files['locus_export/data.json'] = strToU8(
    JSON.stringify(
      {
        app: 'Locus',
        exportedAt: new Date().toISOString(),
        coordinateSystem: 'WGS84',
        count: items.length,
        records: items,
      },
      null,
      2,
    ),
  );
  files['locus_export/index.html'] = strToU8(buildHtml(items));

  for (const r of records) {
    if (r.photoPath) {
      const f = new File(Paths.document, r.photoPath);
      if (f.exists) {
        files[`locus_export/${r.photoPath}`] = await f.bytes();
      }
    }
    if (r.audioPath) {
      const f = new File(Paths.document, r.audioPath);
      if (f.exists) {
        files[`locus_export/${r.audioPath}`] = await f.bytes();
      }
    }
  }

  const zipped = zipSync(files);

  const zipFile = new File(Paths.cache, `locus_export_${Date.now()}.zip`);
  if (zipFile.exists) {
    zipFile.delete();
  }
  zipFile.create();
  zipFile.write(zipped);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(zipFile.uri, {
      mimeType: 'application/zip',
      dialogTitle: '导出经纬数据',
      UTI: 'public.zip-archive',
    });
  }

  return zipFile.uri;
}
