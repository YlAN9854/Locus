/**
 * records 表的仓库层:增、查、删。
 * MVP 不做编辑(改)功能。
 *
 * 基于 expo-sqlite 异步 API:
 *   runAsync —— 写(INSERT/DELETE)
 *   getAllAsync —— 查多行
 *   getFirstAsync —— 查单行
 */
import {getDb} from '@/db/database';
import type {LocusRecord, NewLocusRecord} from '@/models/record';
import {uuid} from '@/utils/id';

type Row = {
  id: string;
  created_at: number;
  lat: number;
  lng: number;
  poi_name: string;
  address: string;
  note: string;
  photo_path: string;
  audio_path: string;
  video_path: string;
  embedding: string | null;
};

function rowToRecord(r: Row): LocusRecord {
  return {
    id: r.id,
    createdAt: r.created_at,
    lat: r.lat,
    lng: r.lng,
    poiName: r.poi_name,
    address: r.address,
    note: r.note,
    photoPath: r.photo_path,
    audioPath: r.audio_path,
    videoPath: r.video_path,
  };
}

/** 新增一条记录,返回完整记录(含生成的 id 与时间戳)。 */
export async function insertRecord(input: NewLocusRecord): Promise<LocusRecord> {
  const record: LocusRecord = {
    id: uuid(),
    createdAt: Date.now(),
    ...input,
  };
  await getDb().runAsync(
    `INSERT INTO records (id, created_at, lat, lng, poi_name, address, note, photo_path, audio_path, video_path, embedding)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.createdAt,
      record.lat,
      record.lng,
      record.poiName,
      record.address,
      record.note,
      record.photoPath,
      record.audioPath,
      record.videoPath,
      null,                  // embedding — 异步生成后回填
    ],
  );
  return record;
}

/** 查询全部记录,按时间倒序。 */
export async function getAllRecords(): Promise<LocusRecord[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT * FROM records ORDER BY created_at DESC',
  );
  return rows.map(rowToRecord);
}

/** 按 id 查询单条。 */
export async function getRecordById(id: string): Promise<LocusRecord | null> {
  const row = await getDb().getFirstAsync<Row>(
    'SELECT * FROM records WHERE id = ?',
    [id],
  );
  return row ? rowToRecord(row) : null;
}

/** 删除一条记录(仅删数据库行,照片文件由调用方决定是否一并删除)。 */
export async function deleteRecord(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM records WHERE id = ?', [id]);
}

/** 回填转录文本到 note 字段 */
export async function updateNote(id: string, text: string): Promise<void> {
  await getDb().runAsync('UPDATE records SET note = ? WHERE id = ?', [text, id]);
}

/** 记录总数,用于判断是否首次使用。 */
export async function countRecords(): Promise<number> {
  const row = await getDb().getFirstAsync<{n: number}>(
    'SELECT COUNT(*) AS n FROM records',
  );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// 结构化查询（混合 RAG 的 Stage 1: SQL 精确过滤）
// ---------------------------------------------------------------------------

export interface QueryFilter {
  dateRange?: {start?: number; end?: number};
  locationKeywords?: string[];
}

/**
 * 按时间和地点关键词过滤记录。
 * 所有条件为 AND（交集）。空 filter 等价于 getAllRecords()。
 */
export async function queryRecords(filter: QueryFilter): Promise<LocusRecord[]> {
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
    const orClauses = filter.locationKeywords.map(() =>
      '(poi_name LIKE ? OR address LIKE ?)',
    );
    conditions.push(`(${orClauses.join(' OR ')})`);
    for (const kw of filter.locationKeywords) {
      const pattern = `%${kw}%`;
      params.push(pattern, pattern);
    }
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';
  const rows = await getDb().getAllAsync<Row>(
    `SELECT * FROM records ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(rowToRecord);
}

// ---------------------------------------------------------------------------
// 向量嵌入（混合 RAG 的 Stage 2: 语义匹配）
// ---------------------------------------------------------------------------

/** 回填某条记录的 embedding（JSON 字符串）。 */
export async function updateEmbedding(id: string, vector: number[]): Promise<void> {
  await getDb().runAsync(
    'UPDATE records SET embedding = ? WHERE id = ?',
    [JSON.stringify(vector), id],
  );
}

/** 获取指定记录的 embedding 数据,用于余弦相似度计算。无嵌入的记录 embedding 为 null。 */
export async function getEmbeddingsForRecords(
  ids: string[],
): Promise<{id: string; embedding: string | null}[]> {
  if (ids.length === 0) return [];

  // SQLite 绑定参数上限约 999，分批处理
  const BATCH = 500;
  if (ids.length <= BATCH) {
    const placeholders = ids.map(() => '?').join(',');
    return await getDb().getAllAsync<{id: string; embedding: string | null}>(
      `SELECT id, embedding FROM records WHERE id IN (${placeholders})`,
      ids,
    );
  }

  const results: {id: string; embedding: string | null}[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const placeholders = batch.map(() => '?').join(',');
    const rows = await getDb().getAllAsync<{id: string; embedding: string | null}>(
      `SELECT id, embedding FROM records WHERE id IN (${placeholders})`,
      batch,
    );
    results.push(...rows);
  }
  return results;
}
