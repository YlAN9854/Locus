/**
 * 文本嵌入服务,基于硅基流动(SiliconFlow) Embeddings API。
 *
 * 端点: POST https://api.siliconflow.cn/v1/embeddings
 * 模型: BAAI/bge-large-zh-v1.5（免费、中文最优、1024 维）
 *
 * API Key 复用 SILICONFLOW_API_KEY（与 transcription.ts 共用）。
 * 调用模式与 transcription.ts 一致: expo-constants 读取配置 → fetch → JSON 解析。
 */
import Constants from 'expo-constants';
import {updateEmbedding} from '@/db/records';

const API_BASE = 'https://api.siliconflow.cn/v1';

/** 将任意文本转为 1024 维浮点向量。 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = Constants.expoConfig?.extra?.SILICONFLOW_API_KEY as string;
  const model = (Constants.expoConfig?.extra?.SILICONFLOW_EMBEDDING_MODEL as string) || 'BAAI/bge-large-zh-v1.5';
  if (!apiKey) {
    throw new Error('未配置 SILICONFLOW_API_KEY,请在 .env 中填入');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const res = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
      encoding_format: 'float',
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding 请求失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding as number[] | undefined;
  if (!embedding || embedding.length === 0) {
    throw new Error('Embedding 返回无向量数据');
  }
  return embedding;
}

/**
 * 构建记录的嵌入文本。
 * 只编码「做了什么」维度 —— poiName + note。
 * 时间（createdAt）和地址（address）由 SQL 结构化查询处理,不进入向量。
 */
export function buildRecordEmbeddingText(poiName: string, note: string): string {
  const parts = [poiName.trim(), note.trim()].filter(Boolean);
  return parts.join(' - ') || '未知地点';
}

/**
 * 为一条记录生成 embedding 并写入数据库。
 * fire-and-forget 模式:不阻塞 UI,失败静默（下次查询时该记录无 embedding 降级为 SQL 匹配）。
 */
export async function generateAndStoreEmbedding(
  id: string,
  poiName: string,
  note: string,
): Promise<void> {
  try {
    const text = buildRecordEmbeddingText(poiName, note);
    const vec = await getEmbedding(text);
    await updateEmbedding(id, vec);
  } catch (e) {
    console.warn(`[embedding] 记录 ${id} 嵌入生成失败,将在查询时降级`, e);
  }
}
