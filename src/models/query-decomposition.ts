/**
 * LLM 查询分解的输出类型。
 *
 * 混合 RAG 架构的核心契约：LLM 把 NL 查询拆成三个独立维度，
 * 各自用最合适的引擎处理（SQL 处理时间/地点，Embedding 处理语义）。
 */

export interface QueryDecomposition {
  /** 时间范围（Unix 毫秒）。LLM 根据当前日期解析"去年夏天"等相对时间。两端均可选。 */
  timeFilter?: {
    start?: number;
    end?: number;
  };
  /** 地点关键词,用于 SQL LIKE 匹配 poiName / address。如 ["上海","徐汇"]。空数组 = 无地点限制。 */
  locationKeywords: string[];
  /** 语义查询文本,用于 Embedding 相似度搜索。null = 无需语义匹配（如"去年的记录"这种纯时间查询）。 */
  semanticQuery: string | null;
}
