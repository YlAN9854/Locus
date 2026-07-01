/**
 * NL 查询分解服务。
 *
 * 调用 SiliconFlow Chat API,把用户的自然语言查询拆成 QueryDecomposition:
 *   - 时间 → 绝对 Unix 毫秒范围（SQL BETWEEN）
 *   - 地点 → 关键词列表（SQL LIKE）
 *   - 语义 → 查询文本（Embedding 相似度）
 *
 * 调用模式与 transcription.ts / embedding.ts 一致:
 *   expo-constants → fetch → JSON 解析 → 类型校验。
 *
 * 隐私: 仅发送查询文本 + system prompt（含当前日期）,零条用户记录。
 */
import Constants from 'expo-constants';
import type {QueryDecomposition} from '@/models/query-decomposition';

const API_BASE = 'https://api.siliconflow.cn/v1';

function buildSystemPrompt(): string {
  const now = new Date();
  const todayISO = now.toISOString();
  const todayChinese = now.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});

  return `你是一个查询解析器。用户用自然语言描述想查找的个人时空记录。你的任务是将查询拆解为结构化的过滤条件。

## 记录字段说明
- createdAt: 记录创建时间,Unix 毫秒时间戳
- poiName: 地点名,如"星巴克""某某酒吧"
- address: 详细地址,如"上海市徐汇区XX路"
- note: 用户写的文字备注或语音转录文本

## 当前时间
- ISO: ${todayISO}
- 中文: ${todayChinese}
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
}

/** 将用户的自然语言查询分解为结构化过滤条件。 */
export async function decomposeQuery(query: string): Promise<QueryDecomposition> {
  const apiKey = Constants.expoConfig?.extra?.SILICONFLOW_API_KEY as string;
  const model = (Constants.expoConfig?.extra?.SILICONFLOW_CHAT_MODEL as string) || 'deepseek-ai/DeepSeek-V4-Flash';

  if (!apiKey) {
    throw new Error('未配置 SILICONFLOW_API_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {role: 'system', content: buildSystemPrompt()},
        {role: 'user', content: query},
      ],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`查询分解失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content as string | undefined;
  if (!raw) {
    throw new Error('查询分解返回空内容');
  }

  // 提取 JSON（LLM 可能在前后加了 markdown 代码块标记）
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`查询分解返回非 JSON: ${raw.slice(0, 200)}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`查询分解 JSON 解析失败: ${raw.slice(0, 200)}`);
  }

  // 类型校验 + 默认值
  const parseNumber = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
    return undefined;
  };
  const tf = parsed.timeFilter as Record<string, unknown> | undefined | null;
  const start = parseNumber(tf?.start);
  const end = parseNumber(tf?.end);
  return {
    timeFilter: (start != null || end != null) ? {start, end} : undefined,
    locationKeywords: Array.isArray(parsed.locationKeywords)
      ? (parsed.locationKeywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : [],
    semanticQuery: typeof parsed.semanticQuery === 'string' && parsed.semanticQuery.length > 0
      ? parsed.semanticQuery as string
      : null,
  };
}
