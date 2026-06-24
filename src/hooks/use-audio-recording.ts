/**
 * 录音 + AI 转录。不负责保存到数据库(保存由 screen 统一调用 insertRecord)。
 *
 * 流程:
 *   startRecording → 按住录音
 *   stopRecording → 落盘音频 + 调用硅基流动转录 → 文本就绪
 *   上层拿到 transText + pendingAudioPath 后点「记下」统一保存。
 *
 * @param draftRef 拍照草稿(ref)
 */
import {useEffect, useRef, useState} from 'react';
import {Alert} from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import {persistAudio} from '@/services/audio';
import {transcribe} from '@/services/transcription';
import {getErrorMessage} from '@/utils/error';

export type RecordingPhase = 'idle' | 'recording' | 'transcribing' | 'done';

export function useAudioRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [transText, setTransText] = useState('');
  const pendingAudioPathRef = useRef('');
  const audioReadyRef = useRef(false);

  useEffect(() => {
    if (audioReadyRef.current) return;
    audioReadyRef.current = true;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('需要麦克风权限');
          return;
        }
        await setAudioModeAsync({allowsRecording: true, playsInSilentMode: true});
      } catch (e) {
        console.warn('[audio init]', e);
      }
    })();
  }, []);

  const resetAudio = () => {
    setPhase('idle');
    setTransText('');
    pendingAudioPathRef.current = '';
  };

  const reRecord = () => {
    setPhase('idle');
    setTransText('');
    pendingAudioPathRef.current = '';
  };

  const startRecording = async () => {
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch (e) {
      Alert.alert('录音启动失败', getErrorMessage(e));
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;

      setPhase('transcribing');
      try {
        const audioPath = await persistAudio(uri);
        pendingAudioPathRef.current = audioPath;
        const text = await transcribe(audioPath);
        setTransText(text.trim());
        setPhase('done');
      } catch (e) {
        console.warn('[transcribe] 转录失败', e);
        setTransText('');
        setPhase('done');
      }
    } catch (e) {
      Alert.alert('录音出错', getErrorMessage(e));
    }
  };

  return {
    startRecording,
    stopRecording,
    recorderState,
    phase,
    transText,
    pendingAudioPath: pendingAudioPathRef,
    reRecord,
    resetAudio,
  };
}
