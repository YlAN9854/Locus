/**
 * 一条记录 = 世界线上的一个点。
 * 时空元数据(时间 + 坐标 + 地点名)与每条记录强绑定,不可剥离。
 *
 * 坐标统一存 GCJ-02(高德坐标系),与地图显示一致;
 * 导出时再按需转换为 WGS84(见 services/export.ts)。
 */
export interface LocusRecord {
  /** uuid */
  id: string;
  /** 记录时刻(Unix 毫秒时间戳) */
  createdAt: number;
  /** 纬度 (GCJ-02) */
  lat: number;
  /** 经度 (GCJ-02) */
  lng: number;
  /** 地点名,如「XX酒吧」。无网或反查失败时可能为空字符串 */
  poiName: string;
  /** 详细地址 */
  address: string;
  /** 一句话文字 */
  note: string;
  /** 照片相对路径,如 photos/{uuid}.jpg。读取时拼当前 DocumentDir 前缀 */
  photoPath: string;
  /** 录音相对路径,如 audio/{uuid}.m4a。若该条记录为打字输入则为空字符串 */
  audioPath: string;
}

/** 新建记录时的输入(id 与 createdAt 由仓库层生成) */
export type NewLocusRecord = Omit<LocusRecord, 'id' | 'createdAt'>;
