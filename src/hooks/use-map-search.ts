/**
 * 地图页 RAG 查询管道 hook。
 *
 * 将混合检索逻辑（LLM 拆解 → SQL 过滤 → Embedding 语义匹配）从 screen 中
 * 提取出来,符合「逻辑下沉到 custom hook」的代码规范。
 *
 * Screen 只负责编排: 加载全量数据 → 传入 hook → 渲染结果。
 */
import {useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';

import {queryRecords, getEmbeddingsForRecords} from '@/db/records';
import {decomposeQuery} from '@/services/query-decompose';
import {getEmbedding} from '@/services/embedding';
import {searchByEmbedding} from '@/utils/vector-search';
import {getErrorMessage} from '@/utils/error';
import type {LocusRecord} from '@/models/record';
import type {QueryDecomposition} from '@/models/query-decomposition';
import type {TimePreset} from '@/components/map/time-chips';

function presetToDateRange(preset: TimePreset): {start?: number; end?: number} {
  const now = new Date();
  const end = now.getTime();
  switch (preset) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return {start, end};
    }
    case 'week': {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      return {start: monday.getTime(), end};
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return {start, end};
    }
    default:
      return {};
  }
}

export function useMapSearch(allRecords: LocusRecord[]) {
  const [queryText, setQueryText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [decomposition, setDecomposition] = useState<QueryDecomposition | null>(null);
  const [visibleRecords, setVisibleRecords] = useState<LocusRecord[]>(allRecords);

  // 查询代数计数器: 每次发起新查询递增,仅应用最新代的结果,消除竞态
  const queryGenRef = useRef(0);

  // 当 allRecords 变化（如首次加载）且无活跃筛选时，同步 visibleRecords
  useEffect(() => {
    if (!decomposition) {
      setVisibleRecords(allRecords);
    }
  }, [allRecords, decomposition]);

  /** 仅重新应用已有的 decomposition + 当前 timePreset,不走 LLM */
  const reFilter = async (dec: QueryDecomposition, preset: TimePreset): Promise<void> => {
    const gen = ++queryGenRef.current;
    try {
      const timePresetRange = presetToDateRange(preset);
      const mergedDateRange = {
        start: dec.timeFilter?.start ?? timePresetRange.start,
        end: dec.timeFilter?.end ?? timePresetRange.end,
      };
      const hasDateRange = mergedDateRange.start != null || mergedDateRange.end != null;
      const hasLocation = dec.locationKeywords.length > 0;
      const needsSql = hasDateRange || hasLocation;

      let candidates: LocusRecord[];
      if (needsSql) {
        candidates = await queryRecords({
          dateRange: hasDateRange ? mergedDateRange : undefined,
          locationKeywords: hasLocation ? dec.locationKeywords : undefined,
        });
        const allIds = new Set(allRecords.map(r => r.id));
        candidates = candidates.filter(r => allIds.has(r.id));
      } else {
        candidates = allRecords;
      }

      if (dec.semanticQuery && candidates.length > 0) {
        const queryVec = await getEmbedding(dec.semanticQuery);
        const embeddings = await getEmbeddingsForRecords(candidates.map(r => r.id));
        const matches = searchByEmbedding(queryVec, embeddings, 50, 0.6);
        const matchIds = new Set(matches.map(m => m.id));
        if (gen === queryGenRef.current) {
          setVisibleRecords(candidates.filter(r => matchIds.has(r.id)));
        }
      } else {
        if (gen === queryGenRef.current) {
          setVisibleRecords(candidates);
        }
      }
    } catch (e) {
      if (gen === queryGenRef.current) {
        console.warn('[reFilter] 失败', e);
        setVisibleRecords(allRecords);
      }
    }
  };

  /** 完整 RAG 管道: LLM 拆解 + SQL + Embedding */
  const handleSearch = async (text: string, preset: TimePreset): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) {
      setQueryText('');
      setDecomposition(null);
      setVisibleRecords(allRecords);
      return;
    }

    setIsSearching(true);
    setQueryText(trimmed);

    try {
      const dec = await decomposeQuery(trimmed);
      setDecomposition(dec);
      await reFilter(dec, preset);
    } catch (e) {
      console.warn('[RAG] 管道失败,降级为 SQL LIKE', e);
      try {
        const keywords = trimmed.split(/\s+/).filter(Boolean);
        const fallback = await queryRecords({locationKeywords: keywords});
        const allIds = new Set(allRecords.map(r => r.id));
        setVisibleRecords(fallback.filter(r => allIds.has(r.id)));
        setDecomposition({locationKeywords: keywords, semanticQuery: null});
      } catch (e2) {
        Alert.alert('查询失败', getErrorMessage(e2));
        setVisibleRecords(allRecords);
      }
    } finally {
      setIsSearching(false);
    }
  };

  /** 时间芯片切换: 有活跃查询时走 reFilter,无查询时纯 SQL 时间过滤 */
  const handleTimePresetChange = (preset: TimePreset): void => {
    if (decomposition) {
      reFilter(decomposition, preset);
    } else {
      const range = presetToDateRange(preset);
      if (range.start != null || range.end != null) {
        const gen = ++queryGenRef.current;
        queryRecords({dateRange: range}).then(rows => {
          if (gen === queryGenRef.current) {
            const allIds = new Set(allRecords.map(r => r.id));
            setVisibleRecords(rows.filter(r => allIds.has(r.id)));
          }
        }).catch(e => {
          console.warn('[timePreset] 查询失败', e);
        });
      } else {
        setVisibleRecords(allRecords);
      }
    }
  };

  /** 清除查询,恢复全量 */
  const clearSearch = (): void => {
    setQueryText('');
    setDecomposition(null);
    setVisibleRecords(allRecords);
  };

  return {
    queryText,
    setQueryText,
    isSearching,
    decomposition,
    visibleRecords,
    handleSearch,
    handleTimePresetChange,
    clearSearch,
  };
}
