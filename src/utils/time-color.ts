/**
 * 时间色温渐变工具。
 *
 * 将 createdAt 在可见记录的时间范围中做线性插值,映射到色阶:
 *   蓝（最旧）→ 青 → 绿 → 琥珀 → 红（最新）
 *
 * 仅用于「标记」模式。聚合模式用 SDK 默认样式,热力模式用密度色阶。
 */

interface GradientStop {
  pos: number;  // 0..1
  r: number; g: number; b: number;
}

const GRADIENT: GradientStop[] = [
  {pos: 0.0, r: 59, g: 130, b: 246},   // #3B82F6 蓝
  {pos: 0.25, r: 6, g: 182, b: 212},    // #06B6D4 青
  {pos: 0.5, r: 132, g: 204, b: 22},    // #84CC16 绿
  {pos: 0.75, r: 245, g: 158, b: 11},   // #F59E0B 琥珀
  {pos: 1.0, r: 239, g: 68, b: 68},     // #EF4444 红
];

function lerpColor(t: number): string {
  // 找到 t 所在区间
  let i = 0;
  while (i < GRADIENT.length - 2 && GRADIENT[i + 1].pos < t) i++;
  const a = GRADIENT[i];
  const b = GRADIENT[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  const r = Math.round(a.r + (b.r - a.r) * localT);
  const g = Math.round(a.g + (b.g - a.g) * localT);
  const bl = Math.round(a.b + (b.b - a.b) * localT);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/**
 * 根据记录在时间范围中的位置返回色温颜色。
 * @param createdAt  记录时间戳 (Unix ms)
 * @param rangeStart 可见记录中最早的时间戳
 * @param rangeEnd   可见记录中最晚的时间戳
 */
export function timeColor(
  createdAt: number,
  rangeStart: number,
  rangeEnd: number,
): string {
  if (rangeStart === rangeEnd) return '#3B82F6'; // 只有一条,蓝色
  const t = (createdAt - rangeStart) / (rangeEnd - rangeStart);
  return lerpColor(Math.max(0, Math.min(1, t)));
}
