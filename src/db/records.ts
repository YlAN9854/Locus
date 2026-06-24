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
    `INSERT INTO records (id, created_at, lat, lng, poi_name, address, note, photo_path, audio_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
