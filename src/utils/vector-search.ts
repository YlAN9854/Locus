/**
 * 纯 JS 向量相似度搜索。零依赖,兼容 expo-sqlite managed workflow。
 *
 * 向量维度: 1024（对应 BAAI/bge-large-zh-v1.5）
 * 度量: 余弦相似度 (cosine similarity)
 */

/** 余弦相似度,范围 [-1, 1]。1 = 完全相同方向。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface EmbeddingRecord {
  id: string;
  embedding: string | null; // JSON 数组字符串,如 "[0.12, -0.34, ...]"; null 表示未嵌入
}

export interface ScoredMatch {
  id: string;
  score: number;
}

/** id → 已解析向量缓存,避免重复 JSON.parse */
const vectorCache = new Map<string, number[]>();

/** 解析 embedding JSON 字符串,带缓存 */
function parseEmbedding(id: string, raw: string): number[] | null {
  const cached = vectorCache.get(id);
  if (cached) return cached;
  try {
    const vec = JSON.parse(raw) as number[];
    vectorCache.set(id, vec);
    return vec;
  } catch {
    return null;
  }
}

/** 清除指定 ID 的向量缓存（note 更新导致 embedding 变化时调用） */
export function clearEmbeddingCache(id?: string): void {
  if (id) {
    vectorCache.delete(id);
  } else {
    vectorCache.clear();
  }
}

/**
 * 从候选记录中检索 top-K 最相似的。
 *
 * @param queryVec  查询文本的嵌入向量
 * @param records   候选记录（含 embedding 列）
 * @param topK      返回条数上限
 * @param threshold 相似度阈值,低于此值的丢弃
 */
export function searchByEmbedding(
  queryVec: number[],
  records: EmbeddingRecord[],
  topK = 50,
  threshold = 0.6,
): ScoredMatch[] {
  const results: ScoredMatch[] = [];

  for (const r of records) {
    if (!r.embedding) continue;
    const vec = parseEmbedding(r.id, r.embedding);
    if (!vec || vec.length !== queryVec.length) continue;
    const score = cosineSimilarity(queryVec, vec);
    if (score >= threshold) {
      results.push({id: r.id, score});
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
