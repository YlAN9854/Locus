import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {useAudioRecording} from '@/hooks/use-audio-recording';
import {useAudioPlayer, useAudioPlayerStatus} from 'expo-audio';
import {ensureLocationPermission, getCurrentPlace} from '@/services/location';
import {absoluteAudioPath} from '@/services/audio';
import {insertRecord} from '@/db/records';
import {Colors} from '@/constants/colors';
import {getErrorMessage} from '@/utils/error';

interface Props {
  onSaved: () => void;
}

export default function VoiceCapture({onSaved}: Props) {
  const [note, setNote] = useState('');
  const [poiLine, setPoiLine] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const locationRef = useRef<{lat: number; lng: number; poiName: string; address: string} | null>(null);

  const {startRecording, stopRecording, phase, transText, pendingAudioPath, reRecord, resetAudio} = useAudioRecording();
  const player = useAudioPlayer(null);
  const playerState = useAudioPlayerStatus(player);

  const togglePlayback = () => {
    if (playerState.playing) {
      player.pause();
      setPlaying(false);
    } else {
      const path = pendingAudioPath.current;
      if (!path) return;
      player.replace({uri: absoluteAudioPath(path)});
      setTimeout(() => {
        player.play();
        setPlaying(true);
      }, 200);
    }
  };

  const startLocation = () => {
    setLocating(true);
    ensureLocationPermission().then(ok => {
      if (!ok) {
        Alert.alert('未授权定位', '本条记录将缺少时空坐标');
        setLocating(false);
        return;
      }
      getCurrentPlace().then(place => {
        locationRef.current = place;
        setPoiLine(`${place.poiName || '未知地点'}${place.address ? `  ·  ${place.address}` : ''}`);
        setLocating(false);
      }).catch(() => {
        Alert.alert('定位失败', '已保留录音,可稍后重试');
        setLocating(false);
      });
    });
  };

  const reset = () => {
    clearTimeout(feedbackTimerRef.current);
    resetAudio();
    setNote('');
    setPoiLine('');
    setPlaying(false);
    setSavedFeedback(false);
    locationRef.current = null;
  };

  const save = async () => {
    const loc = locationRef.current;
    const audioPath = pendingAudioPath.current;
    if (!audioPath) return;

    setSaving(true);
    try {
      await insertRecord({
        lat: loc?.lat ?? 0,
        lng: loc?.lng ?? 0,
        poiName: loc?.poiName ?? '',
        address: loc?.address ?? '',
        note: note.trim() || transText,
        photoPath: '',
        audioPath,
        videoPath: '',
      });
      setSavedFeedback(true);
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        reset();
        onSaved();
      }, 1500);
    } catch (e) {
      Alert.alert('保存失败', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (savedFeedback) {
    return (
      <View style={styles.savedWrap}>
        <Text style={styles.savedText}>已记下</Text>
      </View>
    );
  }

  const isPreview = phase === 'done';

  return (
    <View style={styles.container}>
      {!isPreview ? (
        <View style={styles.recordStage}>
          {phase === 'transcribing' ? (
            <View style={styles.transLoadingWrap}>
              <ActivityIndicator size="small" />
              <Text style={styles.transLoadingText}>正在将录音转为文字…</Text>
            </View>
          ) : (
            <>
              {phase === 'idle' && (
                <Text style={styles.guidance}>按住按钮开始说话，松开自动记录</Text>
              )}
              <Pressable
                style={[
                  styles.recordBtn,
                  phase === 'recording' && styles.recordBtnActive,
                ]}
                onPressIn={() => {
                  startRecording();
                  if (!locationRef.current) {
                    startLocation();
                  }
                }}
                onPressOut={phase === 'recording' ? stopRecording : undefined}>
                {phase === 'recording' ? (
                  <View style={styles.recordingWrap}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingHint}>松手停止</Text>
                  </View>
                ) : (
                  <Text style={styles.recordBtnText}>按住录音</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <View style={styles.preview}>
          <Pressable
            style={({pressed}) => [styles.playBtn, pressed && {opacity: 0.7}]}
            onPress={togglePlayback}>
            <Text style={styles.playBtnText}>
              {playing ? '⏸ 暂停' : '▶ 回放'}
            </Text>
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="编辑转写文字…"
            placeholderTextColor={Colors.textPlaceholder}
            value={note || transText}
            onChangeText={setNote}
            multiline
          />

          <View style={styles.placeRow}>
            {locating ? (
              <View style={styles.placeLocating}>
                <ActivityIndicator size="small" />
                <Text style={styles.placeHint}>正在定位地点…</Text>
              </View>
            ) : (
              <Text style={styles.place}>{poiLine || '未知地点'}</Text>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({pressed}) => [
                styles.btn,
                styles.btnGhost,
                pressed && !saving && {opacity: 0.7},
              ]}
              onPress={reRecord}
              disabled={saving}>
              <Text style={styles.btnGhostText}>重录</Text>
            </Pressable>
            <Pressable
              style={({pressed}) => [
                styles.btn,
                styles.btnPrimary,
                pressed && !saving && {opacity: 0.7},
              ]}
              onPress={save}
              disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.onPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>记下</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  recordStage: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40},
  guidance: {
    fontSize: 13,
    color: Colors.textHint,
    marginBottom: 24,
    textAlign: 'center',
  },
  recordBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.recordRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnText: {color: Colors.onPrimary, fontSize: 18, fontWeight: '600'},
  recordBtnActive: {
    backgroundColor: Colors.recordRedDark,
    transform: [{scale: 0.97}],
  },
  recordingWrap: {alignItems: 'center'},
  recordingDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.recordRed,
    marginBottom: 8,
  },
  recordingHint: {fontSize: 13, color: Colors.textMuted, marginTop: 4},
  transLoadingWrap: {flexDirection: 'row', alignItems: 'center', paddingVertical: 20},
  transLoadingText: {marginLeft: 8, fontSize: 14, color: Colors.textHint},
  preview: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 16,
  },
  playBtn: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: Colors.track,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  playBtnText: {fontSize: 15, color: Colors.textSecondary},
  input: {
    minHeight: 90,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    textAlignVertical: 'top',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  placeRow: {marginBottom: 16},
  placeLocating: {flexDirection: 'row', alignItems: 'center'},
  placeHint: {marginLeft: 8, color: Colors.textHint},
  place: {fontSize: 15, fontWeight: '600', color: Colors.textPrimary},
  actions: {flexDirection: 'row', gap: 12},
  btn: {flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  btnGhost: {backgroundColor: Colors.track},
  btnGhostText: {color: Colors.textSecondary, fontSize: 16},
  btnPrimary: {backgroundColor: Colors.primary},
  btnPrimaryText: {color: Colors.onPrimary, fontSize: 16},
  savedWrap: {alignItems: 'center', paddingTop: 24, paddingBottom: 24},
  savedText: {fontSize: 18, fontWeight: '600', color: Colors.textPrimary},
});
