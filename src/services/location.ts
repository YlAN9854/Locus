/**
 * 高德定位 + 逆地理(地点名/地址)封装,基于 expo-gaode-map。
 *
 * 定位与逆地理分两步:
 *  1. getCurrentLocation():拿 GCJ-02 坐标(原生定位 SDK)。
 *  2. reGeocode():拿"最近的地点名/地址"(原生 Search SDK,AMapSearch)。
 *
 * 为什么不用定位 SDK 自带的逆地理:实测 getCurrentLocation 的 reGeocode 字段全空
 * (返回 #pm100011),不可靠;Search 的 reGeocode 才能稳定拿到 pois[0].name(最近店名)。
 *
 * Key:地图/定位/搜索都用同一个 Android SDK Key(由 config plugin 写入 AndroidManifest
 * 的 com.amap.api.v2.apikey)。原生 Search 不使用 Web服务 Key,故无需 initSDK。
 * 定位权限由库内置接口处理。坐标默认 GCJ-02,与地图显示一致。
 * 隐私合规:渲染地图/发起定位前必须先 setPrivacyConfig。
 */
import {ExpoGaodeMapModule, reGeocode} from 'expo-gaode-map';

/** 隐私协议版本号;变更后会要求用户重新同意。 */
const PRIVACY_VERSION = '2026-06-18';

/** 同步高德隐私合规状态。必须在任何地图/定位调用之前执行一次。 */
export function ensureAmapPrivacy(): void {
  if (!ExpoGaodeMapModule.getPrivacyStatus().isReady) {
    ExpoGaodeMapModule.setPrivacyConfig({
      hasShow: true,
      hasContainsPrivacy: true,
      hasAgree: true,
      privacyVersion: PRIVACY_VERSION,
    });
  }
}

/** 确保已获得前台定位权限,返回是否授权。 */
export async function ensureLocationPermission(): Promise<boolean> {
  let status = await ExpoGaodeMapModule.checkLocationPermission();
  if (status.granted) {
    return true;
  }
  status = await ExpoGaodeMapModule.requestLocationPermission();
  return !!status.granted;
}

export interface Place {
  /** 纬度 (GCJ-02) */
  lat: number;
  /** 经度 (GCJ-02) */
  lng: number;
  /** 地点名(最近 POI / AOI),反查失败时为空字符串 */
  poiName: string;
  /** 格式化地址 */
  address: string;
}

/**
 * 单次定位 + 逆地理。先拿坐标,再用 Search reGeocode 拿地点名。
 * 定位失败时 reject;逆地理失败时降级为仅坐标(poiName/address 为空)。
 */
export async function getCurrentPlace(): Promise<Place> {
  const loc = await ExpoGaodeMapModule.getCurrentLocation();
  const lat = loc.latitude;
  const lng = loc.longitude;

  try {
    const r = await reGeocode({location: loc});
    const poiName = r.pois?.[0]?.name || r.aois?.[0]?.name || '';
    return {lat, lng, poiName, address: r.formattedAddress || ''};
  } catch (e) {
    console.warn('[getCurrentPlace] reGeocode 失败(检查 Android key 与网络)', e);
    return {lat, lng, poiName: '', address: ''};
  }
}
