import {useRef, useState} from 'react';
import {Alert} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {ensureLocationPermission, getCurrentPlace} from '@/services/location';
import {absoluteVideoPath, persistVideo} from '@/services/video';
import {getErrorMessage} from '@/utils/error';
import type {NewLocusRecord} from '@/models/record';

export function useVideoCapture() {
  const draftRef = useRef<NewLocusRecord | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [poiLine, setPoiLine] = useState('');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetCapture = () => {
    draftRef.current = null;
    setVideoUri(null);
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
      mediaTypes: ['videos'],
      videoMaxDuration: 15,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setBusy(true);
    try {
      const relPath = await persistVideo(result.assets[0].uri);
      draftRef.current = {
        lat: 0, lng: 0, poiName: '', address: '',
        note: '', photoPath: '', audioPath: '', videoPath: relPath,
      };
      setVideoUri(absoluteVideoPath(relPath));
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
        Alert.alert('定位失败', '已保留视频,可稍后重试');
      }
    } catch (e) {
      Alert.alert('出错了', getErrorMessage(e));
    } finally {
      setLocating(false);
      setBusy(false);
    }
  };

  return {draftRef, videoUri, poiLine, locating, busy, capture, resetCapture};
}
