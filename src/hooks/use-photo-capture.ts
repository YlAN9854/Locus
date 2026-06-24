/**
 * 拍照 + 落盘 + 定位 + 逆地理,封装为可复用 hook。
 *
 * 流程:
 *   调 capture() → 系统相机 → 拷贝原图到永久目录
 *   → 请求定位 → getCurrentPlace 拿到坐标与地点名
 *   → 存入 draftRef(供上层在保存/录音时读取)。
 */
import {useRef, useState} from 'react';
import {Alert} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {ensureLocationPermission, getCurrentPlace} from '@/services/location';
import {absolutePath, persistPhoto} from '@/services/photo';
import {getErrorMessage} from '@/utils/error';
import type {NewLocusRecord} from '@/models/record';

export function usePhotoCapture() {
  const draftRef = useRef<NewLocusRecord | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [poiLine, setPoiLine] = useState('');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetCapture = () => {
    draftRef.current = null;
    setPhotoUri(null);
    setPoiLine('');
    setLocating(false);
  };

  const capture = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('需要相机权限');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setBusy(true);
    try {
      const relPath = await persistPhoto(result.assets[0].uri);
      draftRef.current = {
        lat: 0, lng: 0, poiName: '', address: '',
        note: '', photoPath: relPath, audioPath: '',
      };
      setPhotoUri(absolutePath(relPath));
      setPoiLine('');
      setLocating(true);

      const locOk = await ensureLocationPermission();
      if (!locOk) {
        Alert.alert('未授权定位', '本条记录将缺少时空坐标');
        setLocating(false);
        return;
      }
      try {
        const place = await getCurrentPlace();
        draftRef.current = {
          ...draftRef.current!,
          lat: place.lat,
          lng: place.lng,
          poiName: place.poiName,
          address: place.address,
        };
        setPoiLine(`${place.poiName || '未知地点'}${place.address ? `  ·  ${place.address}` : ''}`);
      } catch (e) {
        Alert.alert('定位失败', '已保留照片,可稍后重试');
      }
    } catch (e) {
      Alert.alert('出错了', getErrorMessage(e));
    } finally {
      setLocating(false);
      setBusy(false);
    }
  };

  return {draftRef, photoUri, poiLine, locating, busy, capture, resetCapture};
}
