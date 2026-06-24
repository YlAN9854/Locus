/**
 * 回看端 —— 一张地图,记过的点散落其上,点开图钉即见当时图文与录音。
 * 这是产品的核心体验:沿世界线走回去。
 *
 * 右上角「导出」即一键导出(信任地基)。
 *
 * 地图基于 expo-gaode-map:MapView 的 initialCameraPosition 与旧 amap3d 同形,
 * Marker 的点击事件为 onMarkerPress(每条记录一个 Marker,闭包捕获该记录)。
 */
import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {MapView, Marker} from 'expo-gaode-map';
import {useAudioPlayer, useAudioPlayerStatus} from 'expo-audio';

import {getAllRecords} from '@/db/records';
import {absolutePath} from '@/services/photo';
import {absoluteAudioPath} from '@/services/audio';
import {exportAll} from '@/services/export';
import {Colors} from '@/constants/colors';
import {getErrorMessage} from '@/utils/error';
import type {LocusRecord} from '@/models/record';

export default function MapScreen() {
  const [records, setRecords] = useState<LocusRecord[]>([]);
  const [selected, setSelected] = useState<LocusRecord | null>(null);
  const [exporting, setExporting] = useState(false);

  // 音频回放
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [playbackId, setPlaybackId] = useState<string | null>(null);

  const load = async () => {
    const all = await getAllRecords();
    setRecords(all.filter(r => r.lat !== 0 || r.lng !== 0));
  };

  useFocusEffect(() => {
    load();
  });

  const onExport = async () => {
    setExporting(true);
    try {
      await exportAll();
    } catch (e) {
      Alert.alert('导出失败', getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const togglePlayback = async (record: LocusRecord) => {
    const uri = absoluteAudioPath(record.audioPath);

    if (playbackId === record.id && playerStatus.playing) {
      player.pause();
      setPlaybackId(null);
      return;
    }

    try {
      player.replace({uri});
      setPlaybackId(record.id);
      // 等 source 加载后播放 — 用 setTimeout 给 replace 一点时间
      setTimeout(() => player.play(), 200);
    } catch (e) {
      console.warn('[playback] 音频加载失败', e);
    }
  };

  const closeDetail = () => {
    if (playerStatus.playing) {
      player.pause();
    }
    setPlaybackId(null);
    setSelected(null);
  };

  const initialCamera = records.length
    ? {target: {latitude: records[0].lat, longitude: records[0].lng}, zoom: 14}
    : {target: {latitude: 35.0, longitude: 105.0}, zoom: 4};

  return (
    <View style={styles.flex}>
      <MapView style={styles.flex} initialCameraPosition={initialCamera}>
        {records.map(r => (
          <Marker
            key={r.id}
            position={{latitude: r.lat, longitude: r.lng}}
            onMarkerPress={() => setSelected(r)}
          />
        ))}
      </MapView>

      <Pressable style={styles.exportBtn} onPress={onExport} disabled={exporting}>
        {exporting ? (
          <ActivityIndicator size="small" color={Colors.onPrimary} />
        ) : (
          <Text style={styles.exportText}>导出</Text>
        )}
      </Pressable>

      {records.length === 0 && (
        <View style={styles.empty} pointerEvents="none">
          <Text style={styles.emptyText}>还没有点亮任何一个时空之点</Text>
          <Text style={styles.emptyHint}>去「记录」拍下第一个此刻</Text>
        </View>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeDetail}>
        <Pressable style={styles.backdrop} onPress={closeDetail}>
          <Pressable style={styles.detail} onPress={() => {}}>
            {selected && (
              <>
                {!!selected.photoPath && (
                  <Image source={{uri: absolutePath(selected.photoPath)}} style={styles.detailPhoto} />
                )}
                <View style={styles.detailMeta}>
                  <Text style={styles.detailTime}>
                    {new Date(selected.createdAt).toLocaleString('zh-CN')}
                  </Text>
                  <Text style={styles.detailPlace}>
                    {selected.poiName || selected.address || '未知地点'}
                  </Text>
                  {!!selected.note && <Text style={styles.detailNote}>{selected.note}</Text>}

                  {!!selected.audioPath && (
                    <Pressable
                      style={styles.playBtn}
                      onPress={() => togglePlayback(selected)}>
                      <Text style={styles.playIcon}>
                        {playbackId === selected.id && playerStatus.playing ? '⏸' : '▶'}
                      </Text>
                      <Text style={styles.playLabel}>
                        {playbackId === selected.id && playerStatus.playing ? '停止' : '回放录音'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Pressable style={styles.closeBtn} onPress={closeDetail}>
                  <Text style={styles.closeText}>关闭</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  exportBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  exportText: {color: Colors.onPrimary, fontSize: 14},
  empty: {position: 'absolute', top: '42%', left: 0, right: 0, alignItems: 'center'},
  emptyText: {fontSize: 15, color: Colors.textEmpty, fontWeight: '600'},
  emptyHint: {marginTop: 6, color: Colors.textMuted},
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end'},
  detail: {backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden'},
  detailPhoto: {width: '100%', height: 300, backgroundColor: Colors.placeholder},
  detailMeta: {padding: 16},
  detailTime: {fontSize: 12, color: Colors.textMuted},
  detailPlace: {fontSize: 17, fontWeight: '700', marginTop: 4, color: Colors.textPrimary},
  detailNote: {fontSize: 15, lineHeight: 23, marginTop: 10, color: Colors.textNote},
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.track,
    alignSelf: 'flex-start',
  },
  playIcon: {fontSize: 14, marginRight: 6},
  playLabel: {fontSize: 14, color: Colors.textNote},
  closeBtn: {alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.placeholder},
  closeText: {color: Colors.textSecondary, fontSize: 16},
});
