/**
 * 测试数据生成脚本。
 *
 * 生成 ~1000 条上海市 2025 年全年的随机记录，写入 SQLite 数据库，
 * 并为每条记录生成 1024 维文本嵌入向量（SiliconFlow API）。
 *
 * 运行: npx tsx scripts/seed.ts
 * 输出: scripts/test-output/locus-test.db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// 加载 .env（项目根目录），不引入额外依赖
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ---------------------------------------------------------------------------
// DDL（与 src/db/schema.ts 一致）
// ---------------------------------------------------------------------------

const CREATE_RECORDS_TABLE = `
  CREATE TABLE IF NOT EXISTS records (
    id          TEXT PRIMARY KEY NOT NULL,
    created_at  INTEGER NOT NULL,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    poi_name    TEXT NOT NULL DEFAULT '',
    address     TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    photo_path  TEXT NOT NULL DEFAULT '',
    audio_path  TEXT NOT NULL DEFAULT '',
    video_path  TEXT NOT NULL DEFAULT '',
    embedding   TEXT
  );
`;

const CREATE_CREATED_AT_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_records_created_at ON records (created_at DESC);
`;

// ---------------------------------------------------------------------------
// 环境变量
// ---------------------------------------------------------------------------

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY ?? '';
const SILICONFLOW_EMBEDDING_MODEL = process.env.SILICONFLOW_EMBEDDING_MODEL ?? 'BAAI/bge-large-zh-v1.5';

if (!SILICONFLOW_API_KEY) {
  console.error('❌ 未配置 SILICONFLOW_API_KEY，请在 .env 中填入');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 上海地点库（GCJ-02 坐标）
// ---------------------------------------------------------------------------

interface Place {
  lat: number;
  lng: number;
  poiName: string;
  address: string;
}

// prettier-ignore
const PLACES: Place[] = [
  // 浦东新区
  { lat: 31.2357, lng: 121.5016, poiName: '陆家嘴', address: '上海市浦东新区陆家嘴环路' },
  { lat: 31.2100, lng: 121.5450, poiName: '世纪公园', address: '上海市浦东新区锦绣路1001号' },
  { lat: 31.2050, lng: 121.6100, poiName: '张江高科技园区', address: '上海市浦东新区张江路' },
  { lat: 31.1550, lng: 121.4800, poiName: '前滩太古里', address: '上海市浦东新区东育路500号' },
  { lat: 31.2200, lng: 121.5400, poiName: '上海科技馆', address: '上海市浦东新区世纪大道2000号' },
  // 徐汇区
  { lat: 31.1950, lng: 121.4370, poiName: '徐家汇', address: '上海市徐汇区虹桥路1号' },
  { lat: 31.2070, lng: 121.4380, poiName: '武康路', address: '上海市徐汇区武康路' },
  { lat: 31.2060, lng: 121.4470, poiName: '衡山路', address: '上海市徐汇区衡山路' },
  { lat: 31.1830, lng: 121.4360, poiName: '上海体育馆', address: '上海市徐汇区漕溪北路1111号' },
  // 静安区
  { lat: 31.2240, lng: 121.4480, poiName: '静安寺', address: '上海市静安区南京西路1686号' },
  { lat: 31.2280, lng: 121.4550, poiName: '南京西路', address: '上海市静安区南京西路' },
  { lat: 31.2400, lng: 121.4650, poiName: '大悦城', address: '上海市静安区西藏北路166号' },
  // 黄浦区
  { lat: 31.2400, lng: 121.4900, poiName: '外滩', address: '上海市黄浦区中山东一路' },
  { lat: 31.2190, lng: 121.4750, poiName: '新天地', address: '上海市黄浦区太仓路181号' },
  { lat: 31.2270, lng: 121.4880, poiName: '豫园', address: '上海市黄浦区福佑路168号' },
  // 长宁区
  { lat: 31.2210, lng: 121.4150, poiName: '中山公园', address: '上海市长宁区长宁路780号' },
  { lat: 31.1950, lng: 121.3850, poiName: '虹桥', address: '上海市长宁区虹桥路' },
  // 杨浦区
  { lat: 31.3000, lng: 121.5150, poiName: '五角场', address: '上海市杨浦区淞沪路' },
  { lat: 31.2980, lng: 121.5100, poiName: '大学路', address: '上海市杨浦区大学路' },
  // 普陀区
  { lat: 31.2420, lng: 121.4380, poiName: '长寿路', address: '上海市普陀区长寿路' },
  // 虹口区
  { lat: 31.2730, lng: 121.4830, poiName: '鲁迅公园', address: '上海市虹口区四川北路2288号' },
  { lat: 31.2520, lng: 121.4980, poiName: '北外滩', address: '上海市虹口区东大名路' },
  // 闵行区
  { lat: 31.1120, lng: 121.3820, poiName: '莘庄', address: '上海市闵行区莘庄镇' },
  { lat: 31.1570, lng: 121.3500, poiName: '七宝', address: '上海市闵行区七宝镇' },
  // 松江区
  { lat: 31.0580, lng: 121.2100, poiName: '泰晤士小镇', address: '上海市松江区三新北路900弄' },
];

// ---------------------------------------------------------------------------
// POI 名称库（按语义类别分组）
// ---------------------------------------------------------------------------

type Category = 'coffee' | 'food' | 'culture' | 'fitness' | 'bar';

const POI_BY_CATEGORY: Record<Category, string[]> = {
  coffee: [
    '星巴克(人民广场店)', 'Manner Coffee(静安寺店)', '%Arabica(武康路店)',
    'Tims(陆家嘴店)', 'Seesaw(愚园路店)', 'M Stand(新天地店)',
  ],
  food: [
    '新荣记', '鼎泰丰', '大董', '南翔馒头店', '哥老官', '桂满陇',
  ],
  culture: [
    '钟书阁', '思南书局', '朵云书院', '上海图书馆', '1933老场坊',
  ],
  fitness: [
    'Pure Fitness', "Will's健身", 'Supermonkey', '一兆韦德', '乐刻健身',
  ],
  bar: [
    'Speak Low', 'Sober Company', 'Union Trading Co', 'Flask', '上海影城',
  ],
};

/** 展平为 { name, category } 数组 */
function allPoiNames(): { name: string; category: Category }[] {
  const result: { name: string; category: Category }[] = [];
  for (const [cat, names] of Object.entries(POI_BY_CATEGORY)) {
    for (const n of names) {
      result.push({ name: n, category: cat as Category });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 备注（note）模板库（按语义类别分组）
// ---------------------------------------------------------------------------

const NOTE_TEMPLATES: Record<Category | 'daily', string[]> = {
  coffee: [
    '午后喝了一杯拿铁，阳光很好',
    '在这办公了一下午，WiFi很快',
    '和朋友约在这见面，聊了很久',
    '点了一杯手冲，品质不错',
    '周末下午在这里看书，很惬意',
    '这家的美式很好喝，值得再来',
    '尝试了新品冷萃，口感惊艳',
    '拿铁拉花做得非常精致',
  ],
  food: [
    '晚餐很好吃，推荐招牌菜',
    '庆祝生日聚餐，很开心',
    '排队排了很久但很值得',
    '午餐和同事一起来的，氛围不错',
    '味道一般，但环境很好',
    '点了招牌菜，确实名不虚传',
    '甜品很棒，下次还来',
    '吃到了心心念念的味道',
  ],
  culture: [
    '安静的看完了半本书',
    '逛了一圈，拍了很多照片',
    '一个人在这思考人生',
    '环境很棒，适合沉浸式阅读',
    '逛了一下午，很有意思',
    '这里面太美了，拍不够',
    '氛围特别宁静，待了很久',
    '随手翻了几本书，时光流淌',
  ],
  fitness: [
    '跑完步大汗淋漓',
    '上了一节瑜伽课，身心舒畅',
    '练腿日，差点走不动路',
    '今天练了核心，感觉很到位',
    '拳击课太解压了',
    '游泳一小时，浑身舒畅',
    '动感单车踩到腿软',
    '拉伸课后整个人轻松多了',
  ],
  bar: [
    '喝到凌晨，好久没这么开心',
    '鸡尾酒很特别，氛围感满分',
    '认识了新朋友，聊得很投机',
    '这里的精酿啤酒种类很多',
    '和大学同学聚会，回忆满满',
    '驻唱乐队很棒，现场氛围炸裂',
    '点了一杯威士忌酸，调得很正',
    '深夜小酌，一个人也很自在',
  ],
  daily: [
    '路过顺便转转',
    '天气很好出来走走',
    '周末放松一下',
    '记一次普通的下午',
    '一个人随便逛逛',
    '散步路过的，拍了张照',
    '心情不错，出来透透气',
    '没什么特别的，就是记一下',
  ],
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 从 2025-01-01 ~ 2025-12-31 随机生成时间戳，春秋（3-5月,9-11月）密度更高 */
function randomTimestamp2025(): number {
  const monthWeights = [
    // 1月     2月     3月     4月     5月     6月
    0.7, 0.7, 1.0, 1.0, 1.0, 0.8,
    // 7月     8月     9月     10月    11月    12月
    0.8, 0.7, 1.0, 1.0, 1.0, 0.7,
  ];

  // 加权随机选月份
  const totalWeight = monthWeights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  let month = 0; // 0-indexed
  for (let i = 0; i < 12; i++) {
    r -= monthWeights[i];
    if (r <= 0) {
      month = i;
      break;
    }
  }

  const year = 2025;
  const day = Math.floor(Math.random() * 28) + 1; // 1-28 避免月末边界问题
  const hour = Math.floor(Math.random() * 14) + 8; // 8:00 ~ 22:00
  const minute = Math.floor(Math.random() * 60);
  return new Date(year, month, day, hour, minute).getTime();
}

/** 构建与 app 中 buildRecordEmbeddingText 一致的嵌入文本 */
function buildEmbeddingText(poiName: string, note: string): string {
  const parts = [poiName.trim(), note.trim()].filter(Boolean);
  return parts.join(' - ') || '未知地点';
}

// ---------------------------------------------------------------------------
// 嵌入生成
// ---------------------------------------------------------------------------

async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  const res = await fetch('https://api.siliconflow.cn/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SILICONFLOW_EMBEDDING_MODEL,
      input: texts,
      encoding_format: 'float',
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API 错误 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const embeddings: number[][] = data?.data;
  if (!embeddings || embeddings.length === 0) {
    throw new Error('Embedding API 返回空数据');
  }
  // 按 index 排序（API 返回顺序可能与输入不一致）
  embeddings.sort((a: any, b: any) => a.index - b.index);
  return embeddings.map((e: any) => e.embedding as number[]);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const outputDir = path.resolve(__dirname, 'test-output');
  const dbPath = path.join(outputDir, 'locus-test.db');

  // 检查是否已有数据
  if (fs.existsSync(dbPath)) {
    console.log(`⚠️  ${dbPath} 已存在。`);
    console.log('   如需重新生成，请先删除该文件: rm scripts/test-output/locus-test.db');
    process.exit(0);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // -- 建库 -----------------------------------------------------------------
  console.log('📦 创建数据库...');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(CREATE_RECORDS_TABLE);
  db.exec(CREATE_CREATED_AT_INDEX);

  // -- 生成记录 ------------------------------------------------------------
  const TOTAL = 1000;
  const poiList = allPoiNames();
  const allCategories: (Category | 'daily')[] = ['coffee', 'food', 'culture', 'fitness', 'bar', 'daily'];

  console.log(`🎲 生成 ${TOTAL} 条随机记录...`);

  interface SeedRecord {
    id: string;
    createdAt: number;
    lat: number;
    lng: number;
    poiName: string;
    address: string;
    note: string;
    category: Category | 'daily';
  }

  const records: SeedRecord[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const place = pick(PLACES);
    const poi = pick(poiList);

    // 80% 概率 note 类别与 POI 类别匹配，15% 跨类别，5% 日常
    let noteCategory: Category | 'daily';
    const roll = Math.random();
    if (roll < 0.80) {
      noteCategory = poi.category;
    } else if (roll < 0.95) {
      noteCategory = pick(allCategories.filter(c => c !== poi.category && c !== 'daily'));
    } else {
      noteCategory = 'daily';
    }

    const noteTemplate = pick(NOTE_TEMPLATES[noteCategory]);
    const ts = randomTimestamp2025();

    records.push({
      id: `seed-${String(i + 1).padStart(4, '0')}`,
      createdAt: ts,
      lat: place.lat + (Math.random() - 0.5) * 0.002, // 加点随机偏移，避免完全重叠
      lng: place.lng + (Math.random() - 0.5) * 0.002,
      poiName: poi.name,
      address: place.address,
      note: noteTemplate,
      category: poi.category,
    });
  }

  // 写库（事务批量插入）
  const insert = db.prepare(`
    INSERT INTO records (id, created_at, lat, lng, poi_name, address, note, photo_path, audio_path, video_path, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', NULL)
  `);

  const insertAll = db.transaction((recs: SeedRecord[]) => {
    for (const r of recs) {
      insert.run(r.id, r.createdAt, r.lat, r.lng, r.poiName, r.address, r.note);
    }
  });

  insertAll(records);
  console.log(`✅ 已写入 ${TOTAL} 条记录`);

  // -- 生成 embedding -------------------------------------------------------
  console.log(`🧠 批量生成 embedding（模型: ${SILICONFLOW_EMBEDDING_MODEL}）...`);

  const BATCH_SIZE = 16;
  const DELAY_MS = 300;

  const updateEmbStmt = db.prepare('UPDATE records SET embedding = ? WHERE id = ?');

  let generated = 0;
  for (let i = 0; i < TOTAL; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const texts = batch.map(r => buildEmbeddingText(r.poiName, r.note));

    try {
      const vectors = await getEmbeddingsBatch(texts);

      const updateBatch = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          updateEmbStmt.run(JSON.stringify(vectors[j]), batch[j].id);
        }
      });
      updateBatch();

      generated += batch.length;
      process.stdout.write(`\r   [embedding] ${generated}/${TOTAL}`);
    } catch (e) {
      console.error(`\n❌ embedding 批次 ${i}-${i + BATCH_SIZE - 1} 失败:`, e);
      console.log('   继续处理剩余记录...');
    }

    // 限流延迟
    if (i + BATCH_SIZE < TOTAL) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log('');

  // -- 统计 -----------------------------------------------------------------
  const count = db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number };
  const withEmb = db.prepare(
    'SELECT COUNT(*) AS n FROM records WHERE embedding IS NOT NULL',
  ).get() as { n: number };

  console.log('');
  console.log('═══════════════════════════════');
  console.log('  生成完成');
  console.log('═══════════════════════════════');
  console.log(`  总记录数:     ${count.n}`);
  console.log(`  已嵌入:       ${withEmb.n}`);
  console.log(`  未嵌入:       ${count.n - withEmb.n}`);
  console.log(`  DB 文件:      ${dbPath}`);
  console.log('═══════════════════════════════');

  db.close();

  if (withEmb.n < TOTAL) {
    console.warn(`\n⚠️  ${TOTAL - withEmb.n} 条记录的 embedding 生成失败，这些记录在语义搜索中不可用。`);
  }
}

main().catch(e => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
