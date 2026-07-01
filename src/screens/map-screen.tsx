/**
 * 回看端 —— 一张地图,记过的点散落其上,点开图钉即见当时图文与录音。
 * 这是产品的核心体验:沿世界线走回去。
 *
 * 右上角「导出」即一键导出(信任地基)。
 * 顶部搜索栏支持自然语言查询（混合 RAG: LLM 拆解 + SQL 过滤 + Embedding 语义匹配）。
 *
 * 地图基于 expo-gaode-map:MapView 的 initialCameraPosition 与旧 amap3d 同形,
 * Marker 的点击事件为 onMarkerPress(每条记录一个 Marker,闭包捕获该记录)。
 */
import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MapView, Marker, Polyline, Cluster, HeatMap} from 'expo-gaode-map';
import {useAudioPlayer, useAudioPlayerStatus} from 'expo-audio';
import {useVideoPlayer, VideoView} from 'expo-video';

import {getAllRecords} from '@/db/records';
import {absolutePath} from '@/services/photo';
import {absoluteAudioPath} from '@/services/audio';
import {absoluteVideoPath} from '@/services/video';
import {exportAll} from '@/services/export';
import {getCurrentPlace} from '@/services/location';
import {useMapSearch} from '@/hooks/use-map-search';
import {timeColor} from '@/utils/time-color';
import {spiderfy} from '@/utils/spiderfy';
import {Colors} from '@/constants/colors';
import {getErrorMessage} from '@/utils/error';
import TimeChips from '@/components/map/time-chips';
import type {TimePreset} from '@/components/map/time-chips';
import type {LocusRecord} from '@/models/record';

/** 当前激活的可视化模式 */
type VisMode = 'markers' | 'cluster' | 'heatmap';

/** Haversine 距离（米） */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapScreen() {
  // -- 数据 --
  const [allRecords, setAllRecords] = useState<LocusRecord[]>([]);
  const [selected, setSelected] = useState<LocusRecord | null>(null);
  const [exporting, setExporting] = useState(false);

  // -- 可视化 --
  const [visMode, setVisMode] = useState<VisMode>('markers');
  const [timePreset, setTimePreset] = useState<TimePreset>('all');

  // -- RAG 查询管道（提取到 hook）--
  const {
    queryText, setQueryText,
    isSearching,
    decomposition,
    visibleRecords,
    handleSearch,
    handleTimePresetChange,
    clearSearch,
  } = useMapSearch(allRecords);

  // -- 地图引用 --
  const mapRef = useRef<React.ElementRef<typeof MapView>>(null);
  const insets = useSafeAreaInsets();

  // 音频回放
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [playbackId, setPlaybackId] = useState<string | null>(null);

  // 视频回放
  const videoPlayer = useVideoPlayer(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoPlaybackId, setVideoPlaybackId] = useState<string | null>(null);

  // 标记是否已完成首次默认视角定位（避免每次聚焦都重新定位）
  const hasSetInitialViewRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const all = await getAllRecords();
      const withCoords = all.filter(r => r.lat !== 0 || r.lng !== 0);
      setAllRecords(withCoords);

      // 默认视角: 仅首次加载时定位
      if (!hasSetInitialViewRef.current && mapRef.current) {
        hasSetInitialViewRef.current = true;
        await animateToDefaultView(withCoords);
      }
    } catch (e) {
      Alert.alert('加载失败', getErrorMessage(e));
    }
  }, []); // useFocusEffect 需要稳定引用，否则每次渲染都重新执行

  /** 定位到当前 GPS 位置，视图范围适配最近的记录（最多 10 条） */
  const animateToDefaultView = async (records: LocusRecord[]) => {
    try {
      const place = await getCurrentPlace();
      const myLat = place.lat;
      const myLng = place.lng;

      if (records.length === 0) {
        mapRef.current?.setCenter({latitude: myLat, longitude: myLng}, true);
        mapRef.current?.setZoom(14, true);
        return;
      }

      // 计算每条记录到当前位置的距离，取最近的 N 条
      const MAX_NEARBY = 10;
      const withDistance = records
        .map(r => ({...r, _dist: haversineDistance(myLat, myLng, r.lat, r.lng)}))
        .sort((a, b) => a._dist - b._dist);
      const nearby = withDistance.slice(0, MAX_NEARBY);

      const points = [
        {latitude: myLat, longitude: myLng},
        ...nearby.map(r => ({latitude: r.lat, longitude: r.lng})),
      ];
      mapRef.current?.fitToCoordinates(points, {paddingFactor: 0.15});
    } catch {
      // 定位失败: 降级为适配所有记录
      if (records.length > 0) {
        const points = records.map(r => ({latitude: r.lat, longitude: r.lng}));
        mapRef.current?.fitToCoordinates(points, {paddingFactor: 0.1});
      }
    }
  };

  const handleFitAll = () => {
    if (visibleRecords.length < 2 || !mapRef.current) return;
    const points = visibleRecords.map(r => ({latitude: r.lat, longitude: r.lng}));
    try {
      mapRef.current.fitToCoordinates(points, {paddingFactor: 0.1});
    } catch (e) {
      console.warn('[fitToCoordinates] 失败', e);
    }
  };

  useFocusEffect(() => {
    load();
  });

  // 时间芯片切换: 更新 UI 状态 + 触发 hook 过滤
  const onTimePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    handleTimePresetChange(preset);
  };

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
    if (videoPlaying) {
      videoPlayer.pause();
      setVideoPlaying(false);
    }
    setVideoPlaybackId(null);
    setSelected(null);
  };

  const toggleVideoPlayback = (record: LocusRecord) => {
    if (videoPlaybackId === record.id && videoPlaying) {
      videoPlayer.pause();
      setVideoPlaying(false);
      return;
    }

    const uri = absoluteVideoPath(record.videoPath);
    videoPlayer.replace(uri);
    setVideoPlaybackId(record.id);
    setTimeout(() => {
      videoPlayer.play();
      setVideoPlaying(true);
    }, 200);
  };

  // 初始相机仅首次渲染时取值,后续不变化（避免缩放回弹）
  const initialCameraRef = useRef(
    visibleRecords.length > 0
      ? {target: {latitude: visibleRecords[0].lat, longitude: visibleRecords[0].lng}, zoom: 14}
      : {target: {latitude: 35.0, longitude: 105.0}, zoom: 4},
  );

  // 筛选摘要文本
  const filterSummary = decomposition
    ? [
        ...(decomposition.locationKeywords.length > 0 ? [decomposition.locationKeywords.join('·')] : []),
        ...(decomposition.semanticQuery ? [decomposition.semanticQuery] : []),
        `${visibleRecords.length}条`,
      ].join(' · ')
    : null;

  // 标记模式: 按时间排序后做螺旋偏移 + 色温着色
  const markersForRender = visMode === 'markers'
    ? spiderfy([...visibleRecords].sort((a, b) => a.createdAt - b.createdAt))
    : [];

  const markerTimeRange = markersForRender.length >= 2
    ? {
        start: markersForRender[0].createdAt,
        end: markersForRender[markersForRender.length - 1].createdAt,
      }
    : null;

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.flex}
        initialCameraPosition={initialCameraRef.current}
        minZoom={11}
        maxZoom={18}>
        {/* 标记模式: 时间色温 + 偏移去重 */}
        {visMode === 'markers' && markersForRender.map(r => (
          <Marker
            key={r.id}
            position={{latitude: r.lat, longitude: r.lng}}
            onMarkerPress={() => setSelected(r)}>
            <View style={[
              styles.markerDot,
              {
                backgroundColor: markerTimeRange
                  ? timeColor(r.createdAt, markerTimeRange.start, markerTimeRange.end)
                  : '#3B82F6',
              },
            ]} />
          </Marker>
        ))}

        {/* 聚合模式 */}
        {visMode === 'cluster' && (
          <Cluster
            points={visibleRecords.map(r => ({
              latitude: r.lat,
              longitude: r.lng,
            }))}
            onClusterPress={() => {}}
          />
        )}

        {/* 热力模式 */}
        {visMode === 'heatmap' && (
          <HeatMap
            data={visibleRecords.map(r => ({
              latitude: r.lat,
              longitude: r.lng,
            }))}
            radius={30}
            opacity={0.7}
          />
        )}

        {/* 轨迹连线: 按时序串联可见记录 */}
        {visibleRecords.length >= 2 && (
          <Polyline
            points={[...visibleRecords]
              .sort((a, b) => a.createdAt - b.createdAt)
              .map(r => ({latitude: r.lat, longitude: r.lng}))}
            strokeWidth={2}
            strokeColor="rgba(37,99,235,0.3)"
          />
        )}
      </MapView>

      {/* 顶部浮动栏 */}
      <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索... 如「去年夏天上海的咖啡店」"
            placeholderTextColor={Colors.textPlaceholder}
            value={queryText}
            onChangeText={setQueryText}
            onSubmitEditing={e => handleSearch(e.nativeEvent.text, timePreset)}
            returnKeyType="search"
            editable={!isSearching}
          />
          {isSearching && (
            <ActivityIndicator size="small" color={Colors.onPrimary} style={styles.searchSpinner} />
          )}
          {queryText.length > 0 && !isSearching && (
            <Pressable onPress={clearSearch} hitSlop={8} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          style={({pressed}) => [styles.exportBtn, pressed && !exporting && {opacity: 0.7}]}
          onPress={onExport}
          disabled={exporting}>
          {exporting ? (
            <ActivityIndicator size="small" color={Colors.onPrimary} />
          ) : (
            <Text style={styles.exportText}>导出</Text>
          )}
        </Pressable>
      </View>

      {/* 筛选摘要（有筛选时显示） */}
      {filterSummary && (
        <View style={styles.filterChip}>
          <Text style={styles.filterChipText} numberOfLines={1}>{filterSummary}</Text>
          <Pressable onPress={clearSearch} hitSlop={8}>
            <Text style={styles.filterChipClear}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* 全览按钮 */}
      {visibleRecords.length >= 2 && (
        <Pressable
          style={({pressed}) => [styles.fitBtn, pressed && {opacity: 0.7}]}
          onPress={handleFitAll}>
          <Text style={styles.fitBtnText}>⊞</Text>
        </Pressable>
      )}

      {/* 底部浮动栏: 时间芯片 + 可视化切换 */}
      <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 8}]}>
        <TimeChips active={timePreset} onChange={onTimePresetChange} />
        <Pressable
          style={({pressed}) => [styles.visBtn, pressed && {opacity: 0.7}]}
          onPress={() => {
            setVisMode(m => (m === 'markers' ? 'cluster' : m === 'cluster' ? 'heatmap' : 'markers'));
          }}>
          <Text style={styles.visBtnText}>
            {visMode === 'markers' ? '📍' : visMode === 'cluster' ? '🔵' : '🔥'}
          </Text>
        </Pressable>
      </View>

      {visibleRecords.length === 0 && (
        <View style={styles.empty} pointerEvents="none">
          <Text style={styles.emptyText}>
            {decomposition ? '没有找到匹配的记录' : '还没有点亮任何一个时空之点'}
          </Text>
          {!decomposition && (
            <Text style={styles.emptyHint}>去「记录」拍下第一个此刻</Text>
          )}
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
                {!!selected.videoPath && (
                  <View style={styles.videoContainer}>
                    <VideoView
                      player={videoPlayer}
                      style={styles.detailPhoto}
                      nativeControls={false}
                      contentFit="cover"
                    />
                    <Pressable
                      style={({pressed}) => [
                        styles.videoPlayBtn,
                        pressed && {backgroundColor: 'rgba(0,0,0,0.5)'},
                      ]}
                      onPress={() => toggleVideoPlayback(selected)}>
                      <Text style={styles.videoPlayText}>
                        {videoPlaybackId === selected.id && videoPlaying ? '⏸ 暂停' : '▶ 播放'}
                      </Text>
                    </Pressable>
                  </View>
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
                      style={({pressed}) => [styles.playBtn, pressed && {opacity: 0.7}]}
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
                <Pressable
                  style={({pressed}) => [styles.closeBtn, pressed && {opacity: 0.7}]}
                  onPress={closeDetail}>
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

  // -- 顶部浮动栏 --
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48, // 状态栏 + 安全区
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 8,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 0, // Android 上去掉默认内边距
  },
  searchSpinner: {
    marginLeft: 6,
  },
  clearBtn: {
    marginLeft: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
  },
  exportBtn: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportText: {color: Colors.onPrimary, fontSize: 14, fontWeight: '600'},

  // -- 筛选摘要 --
  filterChip: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    maxWidth: '90%',
  },
  filterChipText: {
    color: Colors.onPrimary,
    fontSize: 13,
    flexShrink: 1,
  },
  filterChipClear: {
    color: Colors.onPrimary,
    fontSize: 12,
  },

  // -- 底部浮动栏 --
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 32, // 安全区
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 8,
  },
  visBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visBtnText: {
    fontSize: 16,
  },

  // -- 全览按钮 --
  fitBtn: {
    position: 'absolute',
    right: 12,
    bottom: 120,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  fitBtnText: {
    fontSize: 20,
    color: Colors.textPrimary,
  },

  // -- 自定义标记 --
  markerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

  // -- 空状态 --
  empty: {position: 'absolute', top: '42%', left: 0, right: 0, alignItems: 'center'},
  emptyText: {fontSize: 15, color: Colors.textEmpty, fontWeight: '600'},
  emptyHint: {marginTop: 6, color: Colors.textMuted},

  // -- 详情 Modal（保持现有样式） --
  backdrop: {flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'flex-end'},
  detail: {backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden'},
  detailPhoto: {width: '100%', height: 300, backgroundColor: Colors.placeholder},
  videoContainer: {position: 'relative', height: 300, overflow: 'hidden'},
  videoPlayBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.videoOverlay,
  },
  videoPlayText: {color: Colors.onPrimary, fontSize: 16, fontWeight: '600'},
  detailMeta: {padding: 16},
  detailTime: {fontSize: 12, color: Colors.textMuted},
  detailPlace: {fontSize: 17, fontWeight: '700', marginTop: 4, color: Colors.textPrimary},
  detailNote: {fontSize: 15, lineHeight: 23, marginTop: 10, color: Colors.textNote},
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: Colors.track,
    alignSelf: 'flex-start',
  },
  playIcon: {fontSize: 14, marginRight: 6},
  playLabel: {fontSize: 14, color: Colors.textNote},
  closeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.placeholder,
  },
  closeText: {color: Colors.textSecondary, fontSize: 16},
});
