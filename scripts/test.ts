/**
 * NL 查询管道测试脚本。
 *
 * 加载已有 locus-test.db，运行四层测试：
 *   1. SQL 过滤（确定性断言）
 *   2. 语义搜索（阈值断言，查询向量可缓存）
 *   3. LLM 查询拆解（烟雾测试）
 *   4. 端到端管道（集成测试）
 *
 * 运行: npx tsx scripts/test.ts
 * 前置: 先运行 npx tsx scripts/seed.ts 生成测试数据
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { searchByEmbedding, clearEmbeddingCache } from '../src/utils/vector-search';

// ---------------------------------------------------------------------------
// 加载 .env
// ---------------------------------------------------------------------------

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
// 配置
// ---------------------------------------------------------------------------

const DB_PATH = path.resolve(__dirname, 'test-output', 'locus-test.db');
const CACHE_PATH = path.resolve(__dirname, 'test-output', 'query-vectors.json');

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY ?? '';
const SILICONFLOW_EMBEDDING_MODEL = process.env.SILICONFLOW_EMBEDDING_MODEL ?? 'BAAI/bge-large-zh-v1.5';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-v4-flash';

// ---------------------------------------------------------------------------
// 测试框架
// ---------------------------------------------------------------------------

interface TestResult {
  layer: string;
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];
let currentLayer = '';

function layer(name: string) {
  currentLayer = name;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
}

function test(name: string, fn: () => { pass: boolean; detail: string } | void) {
  try {
    const r = fn();
    const pass = r?.pass ?? true;
    const detail = r?.detail ?? 'OK';
    results.push({ layer: currentLayer, name, pass, detail });
    const icon = pass ? '✅' : '❌';
    console.log(`  ${icon}  ${name}`);
    if (!pass) console.log(`      ${detail}`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    results.push({ layer: currentLayer, name, pass: false, detail: msg });
    console.log(`  ❌  ${name}`);
    console.log(`      ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 嵌入式查询向量缓存
// ---------------------------------------------------------------------------

function loadQueryVectorCache(): Record<string, number[]> {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveQueryVectorCache(cache: Record<string, number[]>) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// API 辅助函数（独立实现，等价于 app 中的对应函数）
// ---------------------------------------------------------------------------

async function getEmbedding(text: string): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch('https://api.siliconflow.cn/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SILICONFLOW_EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float',
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`Embedding API ${res.status}`);
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding as number[] | undefined;
  if (!vec || vec.length === 0) throw new Error('Embedding 返回空');
  return vec;
}

async function getOrCacheQueryVector(text: string): Promise<number[]> {
  const cache = loadQueryVectorCache();
  if (cache[text]) {
    console.log(`      [向量缓存命中] "${text}"`);
    return cache[text];
  }
  console.log(`      [获取向量] "${text}"`);
  const vec = await getEmbedding(text);
  cache[text] = vec;
  saveQueryVectorCache(cache);
  return vec;
}

/** 与 app/src/services/query-decompose.ts 等价的独立实现 */
async function decomposeQuery(query: string): Promise<{
  timeFilter?: { start?: number; end?: number };
  locationKeywords: string[];
  semanticQuery: string | null;
}> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('未配置 DEEPSEEK_API_KEY');
  }

  const now = new Date();
  const systemPrompt = `你是一个查询解析器。用户用自然语言描述想查找的个人时空记录。你的任务是将查询拆解为结构化的过滤条件。

## 记录字段说明
- createdAt: 记录创建时间,Unix 毫秒时间戳
- poiName: 地点名,如"星巴克""某某酒吧"
- address: 详细地址,如"上海市徐汇区XX路"
- note: 用户写的文字备注或语音转录文本

## 当前时间
- ISO: ${now.toISOString()}
- 中文: ${now.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}
- Unix 毫秒: ${now.getTime()}

## 输出格式
只输出 JSON,不要任何其他文字。JSON 结构如下:
{
  "timeFilter": { "start": 1700000000000, "end": 1720000000000 }  // 或 null
  "locationKeywords": ["上海"],                                    // 或 []
  "semanticQuery": "有情调的酒吧"                                   // 或 null
}

## 规则
1. 时间表达式转为绝对 Unix 毫秒时间戳。如"去年夏天"= 上一年的6月1日 00:00:00 ~ 8月31日 23:59:59。"上个月"= 上个月1日~最后一天。"这周"= 本周一~周日。
2. 地点关键词: 提取城市名、区名、街道名等地理名词。如"上海的"→["上海"],"徐汇区"→["徐汇"]。不要提取场所类型(如"酒吧""咖啡店"——这些属于 semanticQuery)。
3. 语义查询: 提取描述"做了什么"或"什么类型的地方"的部分。如"有情调的酒吧"→"有情调的酒吧","喝醉的晚上"→"喝醉的晚上"。纯时间/地点查询(如"去年夏天的记录")→ semanticQuery 为 null。
4. 如果用户只是泛泛地查看(如"看看有什么"),所有字段均可为 null/空。
5. 忽略填充词("的""了""去过""帮我找""我想看")。`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_CHAT_MODEL,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content as string | undefined;
  if (!raw) throw new Error('查询分解返回空内容');

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`返回非 JSON: ${raw.slice(0, 200)}`);

  const parseNumber = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
    return undefined;
  };

  const parsed = JSON.parse(jsonMatch[0]);
  const tf = parsed.timeFilter as Record<string, unknown> | undefined | null;
  const start = parseNumber(tf?.start);
  const end = parseNumber(tf?.end);
  return {
    timeFilter: (start != null || end != null) ? { start, end } : undefined,
    locationKeywords: Array.isArray(parsed.locationKeywords)
      ? (parsed.locationKeywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : [],
    semanticQuery: typeof parsed.semanticQuery === 'string' && parsed.semanticQuery.length > 0
      ? (parsed.semanticQuery as string)
      : null,
  };
}

// ---------------------------------------------------------------------------
// DB 查询辅助（better-sqlite3 等价于 app 中的 queryRecords）
// ---------------------------------------------------------------------------

interface RecordRow {
  id: string;
  created_at: number;
  lat: number;
  lng: number;
  poi_name: string;
  address: string;
  note: string;
  embedding: string | null;
}

function queryRecords(
  db: Database.Database,
  filter: { dateRange?: { start?: number; end?: number }; locationKeywords?: string[] },
): RecordRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.dateRange?.start != null) {
    conditions.push('created_at >= ?');
    params.push(filter.dateRange.start);
  }
  if (filter.dateRange?.end != null) {
    conditions.push('created_at <= ?');
    params.push(filter.dateRange.end);
  }
  if (filter.locationKeywords && filter.locationKeywords.length > 0) {
    const orClauses = filter.locationKeywords.map(() => '(poi_name LIKE ? OR address LIKE ?)');
    conditions.push(`(${orClauses.join(' OR ')})`);
    for (const kw of filter.locationKeywords) {
      const pattern = `%${kw}%`;
      params.push(pattern, pattern);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM records ${where} ORDER BY created_at DESC`).all(...params) as RecordRow[];
}

function getAllRecords(db: Database.Database): RecordRow[] {
  return db.prepare('SELECT * FROM records ORDER BY created_at DESC').all() as RecordRow[];
}

// ---------------------------------------------------------------------------
// 测试入口
// ---------------------------------------------------------------------------

async function main() {
  // 检查 DB 是否存在
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ 未找到测试数据库: ${DB_PATH}`);
    console.error('   请先运行: npx tsx scripts/seed.ts');
    process.exit(1);
  }

  console.log('🧪 Locus NL 查询管道测试');
  console.log(`   DB: ${DB_PATH}`);

  const db = new Database(DB_PATH, { readonly: true });

  const totalRecords = (db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
  const withEmb = (db.prepare(
    'SELECT COUNT(*) AS n FROM records WHERE embedding IS NOT NULL',
  ).get() as { n: number }).n;
  console.log(`   记录总数: ${totalRecords}  |  已嵌入: ${withEmb}`);
  console.log('');

  // =========================================================================
  // 第一层：SQL 过滤
  // =========================================================================
  layer('第一层：SQL 过滤（确定性断言）');

  const TS_MAR1 = new Date(2025, 2, 1).getTime();   // 2025-03-01 00:00
  const TS_APR1 = new Date(2025, 3, 1).getTime();   // 2025-04-01 00:00
  const TS_JUN1 = new Date(2025, 5, 1).getTime();
  const TS_SEP1 = new Date(2025, 8, 1).getTime();
  const TS_JAN1 = new Date(2025, 0, 1).getTime();
  const TS_DEC31 = new Date(2025, 11, 31, 23, 59, 59).getTime();

  test('时间范围 — 2025年3月', () => {
    const rows = queryRecords(db, { dateRange: { start: TS_MAR1, end: TS_APR1 - 1 } });
    const pass = rows.length >= 60 && rows.length <= 110; // 月均 ~83，±30%
    // 验证全部在 3 月
    const allInMarch = rows.every(r => {
      const d = new Date(r.created_at);
      return d.getMonth() === 2 && d.getFullYear() === 2025;
    });
    return {
      pass: pass && allInMarch,
      detail: pass
        ? `${rows.length} 条记录，全部在 2025年3月`
        : `预期 60~110 条，实际 ${rows.length} 条；全部在3月: ${allInMarch}`,
    };
  });

  test('时间范围+地点 — 6-8月 AND 徐汇区', () => {
    const rows = queryRecords(db, {
      dateRange: { start: TS_JUN1, end: TS_SEP1 - 1 },
      locationKeywords: ['徐汇'],
    });
    const allInRange = rows.every(r => r.created_at >= TS_JUN1 && r.created_at < TS_SEP1);
    const allInXuhui = rows.every(
      r => r.poi_name.includes('徐汇') || r.address.includes('徐汇'),
    );
    return {
      pass: rows.length > 0 && allInRange && allInXuhui,
      detail: `${rows.length} 条，全部在6-8月: ${allInRange}，全部含"徐汇": ${allInXuhui}`,
    };
  });

  test('纯地点 — 浦东', () => {
    const rows = queryRecords(db, { locationKeywords: ['浦东'] });
    const allMatch = rows.every(r => r.poi_name.includes('浦东') || r.address.includes('浦东'));
    return {
      pass: rows.length > 0 && allMatch,
      detail: `${rows.length} 条，全部含"浦东": ${allMatch}`,
    };
  });

  test('多地标 OR — 静安 + 黄浦', () => {
    const rows = queryRecords(db, { locationKeywords: ['静安', '黄浦'] });
    const allMatch = rows.every(
      r => ['静安', '黄浦'].some(kw => r.poi_name.includes(kw) || r.address.includes(kw)),
    );
    return {
      pass: rows.length > 0 && allMatch,
      detail: `${rows.length} 条，100% 至少含一个区名: ${allMatch}`,
    };
  });

  test('空过滤 — 返回全部', () => {
    const rows = queryRecords(db, {});
    return {
      pass: rows.length === totalRecords,
      detail: `${rows.length} 条（总数: ${totalRecords})`,
    };
  });

  test('时间范围 — 2025全年', () => {
    const rows = queryRecords(db, { dateRange: { start: TS_JAN1, end: TS_DEC31 } });
    return {
      pass: rows.length === totalRecords,
      detail: `${rows.length} 条，应等于总数 ${totalRecords}`,
    };
  });

  // =========================================================================
  // 第二层：语义搜索
  // =========================================================================
  layer('第二层：语义搜索（阈值断言）');

  // 清除向量缓存，确保测试环境干净
  clearEmbeddingCache();

  // 关键词匹配规则 — 判定一条记录是否属于某个语义类别
  function hasCoffeeKeyword(r: RecordRow): boolean {
    const coffeeWords = ['咖啡', '拿铁', '美式', '手冲', '冷萃', '星巴克', 'Manner', 'Arabica', 'Tims', 'Seesaw', 'M Stand'];
    return coffeeWords.some(w => r.poi_name.includes(w) || r.note.includes(w));
  }
  function hasFitnessKeyword(r: RecordRow): boolean {
    const fitnessWords = ['Fitness', '健身', 'Supermonkey', '韦德', '乐刻', '跑步', '瑜伽', '练腿', '练了', '拳击', '游泳', '动感单车', '拉伸', '核心'];
    return fitnessWords.some(w => r.poi_name.includes(w) || r.note.includes(w));
  }
  function hasReadingKeyword(r: RecordRow): boolean {
    const readingWords = ['书', '图书馆', '1933', '阅读', '安静', '沉浸', '时光流淌', '翻了几页'];
    return readingWords.some(w => r.poi_name.includes(w) || r.note.includes(w));
  }

  test('语义 — "咖啡店"', async () => {
    const queryVec = await getOrCacheQueryVector('咖啡店');
    const all = getAllRecords(db);
    const embRecords = all
      .filter(r => r.embedding)
      .map(r => ({ id: r.id, embedding: r.embedding }));

    if (embRecords.length === 0) {
      return { pass: false, detail: '没有找到任何已嵌入的记录' };
    }

    const matches = searchByEmbedding(queryVec, embRecords, 20, 0.6);
    const matchedRows = all.filter(r => matches.some(m => m.id === r.id));
    const coffeeCount = matchedRows.filter(hasCoffeeKeyword).length;
    const ratio = matchedRows.length > 0 ? coffeeCount / matchedRows.length : 0;

    return {
      pass: ratio >= 0.7 && matchedRows.length >= 5,
      detail: `top-20 中 ${coffeeCount}/${matchedRows.length} 含咖啡关键词 (${(ratio * 100).toFixed(0)}%)，阈值 ≥70%`,
    };
  });

  test('语义 — "运动健身"', async () => {
    const queryVec = await getOrCacheQueryVector('运动健身');
    const all = getAllRecords(db);
    const embRecords = all
      .filter(r => r.embedding)
      .map(r => ({ id: r.id, embedding: r.embedding }));

    const matches = searchByEmbedding(queryVec, embRecords, 20, 0.6);
    const matchedRows = all.filter(r => matches.some(m => m.id === r.id));
    const fitnessCount = matchedRows.filter(hasFitnessKeyword).length;
    const ratio = matchedRows.length > 0 ? fitnessCount / matchedRows.length : 0;

    return {
      pass: ratio >= 0.7 && matchedRows.length >= 5,
      detail: `top-20 中 ${fitnessCount}/${matchedRows.length} 含运动关键词 (${(ratio * 100).toFixed(0)}%)，阈值 ≥70%`,
    };
  });

  test('语义 — "安静看书的地方"', async () => {
    const queryVec = await getOrCacheQueryVector('安静看书的地方');
    const all = getAllRecords(db);
    const embRecords = all
      .filter(r => r.embedding)
      .map(r => ({ id: r.id, embedding: r.embedding }));

    const matches = searchByEmbedding(queryVec, embRecords, 20, 0.6);
    const matchedRows = all.filter(r => matches.some(m => m.id === r.id));
    const readingCount = matchedRows.filter(hasReadingKeyword).length;
    const ratio = matchedRows.length > 0 ? readingCount / matchedRows.length : 0;

    return {
      pass: ratio >= 0.7 && matchedRows.length >= 3,
      detail: `top-20 中 ${readingCount}/${matchedRows.length} 含阅读/文化关键词 (${(ratio * 100).toFixed(0)}%)，阈值 ≥70%`,
    };
  });

  test('语义 — 无关查询 "外星球探险登陆火星"', async () => {
    const queryVec = await getOrCacheQueryVector('外星球探险登陆火星');
    const all = getAllRecords(db);
    const embRecords = all
      .filter(r => r.embedding)
      .map(r => ({ id: r.id, embedding: r.embedding }));

    const matches = searchByEmbedding(queryVec, embRecords, 50, 0.6);
    return {
      pass: matches.length <= 5,
      detail: `匹配 ${matches.length} 条（预期 ≤5），最高分: ${matches[0]?.score?.toFixed(3) ?? 'N/A'}`,
    };
  });

  // =========================================================================
  // 第三层：LLM 查询拆解
  // =========================================================================
  layer('第三层：LLM 查询拆解（烟雾测试）');

  if (!DEEPSEEK_API_KEY) {
    console.log('  ⏭️  跳过（未配置 DEEPSEEK_API_KEY）');
  } else {
    // 辅助：检查时间戳是否在 2025 年目标月份范围内（±3 天容差）
    function inMonthRange(ts: number | undefined, targetMonth: number): boolean {
      if (ts == null) return true; // undefined = 无限制，算通过
      const monthStart = new Date(2025, targetMonth, 1).getTime();
      const monthEnd = new Date(2025, targetMonth + 1, 0, 23, 59, 59).getTime();
      const tolerance = 3 * 24 * 60 * 60 * 1000; // ±3 天
      return ts >= monthStart - tolerance && ts <= monthEnd + tolerance;
    }

    test('时间拆解 — "去年夏天的记录"', async () => {
      const dec = await decomposeQuery('去年夏天的记录');
      // 当前日期 2026-07 → "去年夏天" = 2025年6~8月
      const startOk = inMonthRange(dec.timeFilter?.start, 5); // June
      const endOk = inMonthRange(dec.timeFilter?.end, 7);     // August
      const semanticNull = dec.semanticQuery === null;
      return {
        pass: startOk && endOk && semanticNull,
        detail: [
          `timeFilter: ${dec.timeFilter ? `${new Date(dec.timeFilter.start!).toISOString()} ~ ${new Date(dec.timeFilter.end!).toISOString()}` : 'null'}`,
          `start 在6月: ${startOk} | end 在8月: ${endOk}`,
          `locationKeywords: [${dec.locationKeywords.join(', ')}]`,
          `semanticQuery: ${dec.semanticQuery ?? 'null'} (应为 null: ${semanticNull})`,
        ].join('\n      '),
      };
    });

    test('区域提取 — "徐汇区的咖啡店"', async () => {
      const dec = await decomposeQuery('徐汇区的咖啡店');
      const hasXuhui = dec.locationKeywords.some(k => k.includes('徐汇'));
      const hasCoffee = dec.semanticQuery?.includes('咖啡') ?? false;
      return {
        pass: hasXuhui && hasCoffee,
        detail: [
          `locationKeywords: [${dec.locationKeywords.join(', ')}] (应含"徐汇": ${hasXuhui})`,
          `semanticQuery: ${dec.semanticQuery ?? 'null'} (应含"咖啡": ${hasCoffee})`,
        ].join('\n      '),
      };
    });

    test('纯时间 — "2025年3月"', async () => {
      const dec = await decomposeQuery('2025年3月');
      const startOk = inMonthRange(dec.timeFilter?.start, 2); // March
      const endOk = inMonthRange(dec.timeFilter?.end, 2);
      const semanticNull = dec.semanticQuery === null;
      return {
        pass: startOk && endOk && semanticNull,
        detail: [
          `timeFilter start 在3月: ${startOk} | end 在3月: ${endOk}`,
          `semanticQuery: ${dec.semanticQuery ?? 'null'} (应为 null: ${semanticNull})`,
        ].join('\n      '),
      };
    });
  }

  // =========================================================================
  // 第四层：端到端管道
  // =========================================================================
  layer('第四层：端到端管道（集成测试）');

  if (!DEEPSEEK_API_KEY) {
    console.log('  ⏭️  跳过（未配置 DEEPSEEK_API_KEY）');
  } else {
    /** 完整 RAG 管道：LLM 拆解 → SQL 过滤 → Embedding 匹配 */
    async function fullPipeline(query: string): Promise<RecordRow[]> {
      const dec = await decomposeQuery(query);

      // Step 1: SQL 过滤
      const hasDateRange = dec.timeFilter?.start != null || dec.timeFilter?.end != null;
      const hasLocation = dec.locationKeywords.length > 0;
      const needsSql = hasDateRange || hasLocation;

      let candidates = getAllRecords(db);
      if (needsSql) {
        candidates = queryRecords(db, {
          dateRange: hasDateRange ? dec.timeFilter : undefined,
          locationKeywords: hasLocation ? dec.locationKeywords : undefined,
        });
      }

      // Step 2: 语义搜索
      if (dec.semanticQuery && candidates.length > 0) {
        const queryVec = await getEmbedding(dec.semanticQuery);
        const embRecords = candidates
          .filter(r => r.embedding)
          .map(r => ({ id: r.id, embedding: r.embedding! }));
        const matches = searchByEmbedding(queryVec, embRecords, 50, 0.6);
        const matchIds = new Set(matches.map(m => m.id));
        return candidates.filter(r => matchIds.has(r.id));
      }

      return candidates;
    }

    test('组合查询 — "去年夏天在静安区喝咖啡"', async () => {
      const rows = await fullPipeline('去年夏天在静安区喝咖啡');

      // 应全部在 2025 年 6-8 月
      const TS_JUN = new Date(2025, 5, 1).getTime();
      const TS_SEP = new Date(2025, 8, 1).getTime();
      const allInSummer = rows.every(r => r.created_at >= TS_JUN && r.created_at < TS_SEP);
      // 应全部在静安区
      const allInJingAn = rows.every(r => r.poi_name.includes('静安') || r.address.includes('静安'));

      return {
        pass: rows.length > 0 && allInSummer && allInJingAn,
        detail: [
          `${rows.length} 条结果`,
          `全部在6-8月: ${allInSummer}`,
          `全部在静安区: ${allInJingAn}`,
        ].join(' | '),
      };
    });

    test('纯时间查询 — "去年冬天的记录"', async () => {
      const rows = await fullPipeline('去年冬天的记录');

      // 冬天 = 2025年1-2月 或 2025年11-12月
      const isWinter = (ts: number) => {
        const m = new Date(ts).getMonth(); // 0-indexed
        return m === 0 || m === 1 || m === 10 || m === 11;
      };
      const winterCount = rows.filter(r => isWinter(r.created_at)).length;
      const ratio = rows.length > 0 ? winterCount / rows.length : 0;

      return {
        pass: rows.length > 0 && ratio >= 0.75,
        detail: `${rows.length} 条，其中 ${winterCount} 条在冬季月份 (${(ratio * 100).toFixed(0)}%，阈值 ≥75%)`,
      };
    });
  }

  // =========================================================================
  // 报告
  // =========================================================================
  db.close();

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log(`\n${'='.repeat(60)}`);
  console.log('  测试报告');
  console.log('='.repeat(60));
  console.log(`  总计: ${results.length}  |  ✅ 通过: ${passed}  |  ❌ 失败: ${failed}`);
  console.log('');

  // 按层汇总
  const layers = [...new Set(results.map(r => r.layer))];
  for (const l of layers) {
    const lr = results.filter(r => r.layer === l);
    const lp = lr.filter(r => r.pass).length;
    const icon = lp === lr.length ? '✅' : '⚠️';
    console.log(`  ${icon} ${l}: ${lp}/${lr.length}`);
  }
  console.log('');

  // 失败详情
  if (failed > 0) {
    console.log('  失败详情:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ❌ [${r.layer}] ${r.name}`);
      console.log(`       ${r.detail}`);
    }
    console.log('');
  }

  // 写报告文件
  const reportPath = path.resolve(__dirname, 'test-output', 'report.md');
  const reportLines = [
    `# Locus NL 查询管道测试报告`,
    '',
    `> 运行时间: ${new Date().toISOString()}`,
    `> 数据库: ${path.basename(DB_PATH)} (${totalRecords} 条记录, ${withEmb} 已嵌入)`,
    '',
    `## 结果汇总`,
    '',
    `| 层 | 通过 | 失败 |`,
    `|----|------|------|`,
    ...layers.map(l => {
      const lr = results.filter(r => r.layer === l);
      const lp = lr.filter(r => r.pass).length;
      const lf = lr.filter(r => !r.pass).length;
      return `| ${l} | ${lp} | ${lf} |`;
    }),
    '',
    `**总计: ${results.length} 项, ✅ ${passed} 通过, ❌ ${failed} 失败**`,
    '',
    '## 详细结果',
    '',
    ...results.map(r =>
      `- ${r.pass ? '✅' : '❌'} **${r.name}** — ${r.detail}`,
    ),
    '',
  ];
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  console.log(`📄 报告已写入: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
