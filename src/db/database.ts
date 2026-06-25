/**
 * expo-sqlite 数据库初始化与单例。
 *
 * 用 SDK 50+ 的异步 API(openDatabaseAsync / execAsync / runAsync / getAllAsync)。
 */
import * as SQLite from 'expo-sqlite';
import {CREATE_CREATED_AT_INDEX, CREATE_RECORDS_TABLE, MIGRATE_V2_AUDIO_PATH, MIGRATE_V3_VIDEO_PATH, DB_NAME} from '@/db/schema';

let db: SQLite.SQLiteDatabase | null = null;

/** App 启动时调用一次,打开数据库并建表。 */
export async function initDatabase(): Promise<void> {
  if (db) {
    return;
  }
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(CREATE_RECORDS_TABLE);
  await db.execAsync(CREATE_CREATED_AT_INDEX);
  // migration: 旧库无 audio_path 则补齐(幂等)
  const cols = await db.getAllAsync<{name: string}>(
    "PRAGMA table_info('records')",
  );
  if (!cols.some(c => c.name === 'audio_path')) {
    await db.execAsync(MIGRATE_V2_AUDIO_PATH);
  }
  // migration: 旧库无 video_path 则补齐(幂等)
  const colsV3 = await db.getAllAsync<{name: string}>(
    "PRAGMA table_info('records')",
  );
  if (!colsV3.some(c => c.name === 'video_path')) {
    await db.execAsync(MIGRATE_V3_VIDEO_PATH);
  }
}

/** 获取已初始化的数据库实例。 */
export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('数据库尚未初始化,请先调用 initDatabase()');
  }
  return db;
}
