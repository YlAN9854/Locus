/**
 * 数据库 schema。MVP 单表起步。
 */
export const DB_NAME = 'locus.db';

export const CREATE_RECORDS_TABLE = `
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
    video_path  TEXT NOT NULL DEFAULT ''
  );
`;

/** 按时间倒序查询常用,建个索引 */
export const CREATE_CREATED_AT_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_records_created_at ON records (created_at DESC);
`;

/** v1 → v2: 新增录音路径列(幂等)。 */
export const MIGRATE_V2_AUDIO_PATH = `
  ALTER TABLE records ADD COLUMN audio_path TEXT NOT NULL DEFAULT '';
`;

/** v2 → v3: 新增视频路径列(幂等)。 */
export const MIGRATE_V3_VIDEO_PATH = `
  ALTER TABLE records ADD COLUMN video_path TEXT NOT NULL DEFAULT '';
`;

/** v3 → v4: 新增向量嵌入列(幂等)。存储 JSON 数组,如 "[0.12, -0.34, ...]" (1024-dim)。NULL 表示未嵌入。 */
export const MIGRATE_V4_EMBEDDING = `
  ALTER TABLE records ADD COLUMN embedding TEXT;
`;
