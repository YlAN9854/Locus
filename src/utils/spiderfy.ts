/**
 * 重叠标记螺旋偏移（Spiderfication）。
 *
 * 当多个标记坐标距离 < 阈值时,以实际坐标为中心,
 * 按时间顺序向外做螺旋微偏移,使重叠标记肉眼可分。
 *
 * 偏移仅用于渲染,不改变数据库中的真实坐标。
 */

import type {LocusRecord} from '@/models/record';

/** 地球赤道附近 1° 纬度 ≈ 111320 米 */
const METERS_PER_DEG_LAT = 111320;

/** 最小距离阈值（度）。约 15m at equator */
const MIN_DIST_DEG = 0.00015;

function metersToLatDeg(meters: number): number {
  return meters / METERS_PER_DEG_LAT;
}

function metersToLngDeg(meters: number, lat: number): number {
  return meters / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
}

/** 检查两个坐标是否过于接近 */
function isClose(a: LocusRecord, b: LocusRecord): boolean {
  const dLat = Math.abs(a.lat - b.lat);
  const dLng = Math.abs(a.lng - b.lng);
  return dLat < MIN_DIST_DEG && dLng < MIN_DIST_DEG;
}

/**
 * 对按时间排序的记录列表做螺旋偏移。
 * 输入记录应按 createdAt 升序排列。
 * 返回新数组（不修改原数据）。
 */
export function spiderfy(records: LocusRecord[]): LocusRecord[] {
  if (records.length <= 1) return [...records];

  const result = records.map(r => ({...r})); // shallow copy
  const visited = new Set<number>();

  for (let i = 0; i < result.length; i++) {
    if (visited.has(i)) continue;

    // 找到所有与 i 接近的点
    const group: number[] = [i];
    for (let j = i + 1; j < result.length; j++) {
      if (visited.has(j)) continue;
      if (isClose(result[i], result[j])) {
        group.push(j);
      }
    }

    if (group.length <= 1) continue;

    // 对组内点做螺旋偏移
    const angleStep = (2 * Math.PI) / group.length;
    group.forEach((idx, gi) => {
      visited.add(idx);
      const offsetMeters = 15 + gi * 3; // 渐远: 15m, 18m, 21m...
      const r = result[idx];
      const dLat = metersToLatDeg(offsetMeters * Math.cos(angleStep * gi));
      const dLng = metersToLngDeg(offsetMeters * Math.sin(angleStep * gi), r.lat);
      result[idx] = {...r, lat: r.lat + dLat, lng: r.lng + dLng};
    });
  }

  return result;
}
