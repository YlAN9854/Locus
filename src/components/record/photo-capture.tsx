import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {usePhotoCapture} from '@/hooks/use-photo-capture';
import {useAudioRecording} from '@/hooks/use-audio-recording';
import {insertRecord} from '@/db/records';
import {generateAndStoreEmbedding} from '@/services/embedding';
import {Colors} from '@/constants/colors';
import {getErrorMessage} from '@/utils/error';

type InputMode = 'text' | 'audio';

interface Props {
  onSaved: () => void;
}

export default function PhotoCapture({onSaved}: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const {draftRef, photoUri, poiLine, locating, busy, capture, resetCapture} = usePhotoCapture();
  const {startRecording, stopRecording, phase, transText, pendingAudioPath, reRecord, resetAudio} = useAudioRecording();

  const isDraftReady = !!photoUri;
  const shutterBusy = busy || locating || saving;
  const canSave = inputMode === 'text' ? note.trim().length > 0 || draftRef.current?.photoPath : phase === 'done';

  const reset = () => {
    clearTimeout(feedbackTimerRef.current);
    resetCapture();
    resetAudio();
    setNote('');
    setInputMode('text');
    setSavedFeedback(false);
  };

  const save = async () => {
    if (!draftRef.current) return;
    const draft = draftRef.current;

    let finalNote = '';
    let finalAudioPath = '';

    if (inputMode === 'audio') {
      finalNote = transText;
      finalAudioPath = pendingAudioPath.current;
    } else {
      finalNote = note.trim();
    }

    setSaving(true);
    try {
      const saved = await insertRecord({...draft, note: finalNote, audioPath: finalAudioPath});
      // fire-and-forget: 异步生成向量嵌入,不阻塞保存流程
      generateAndStoreEmbedding(saved.id, saved.poiName, saved.note);
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

  if (!isDraftReady) {
    return (
      <View style={styles.shutterWrap}>
        <Pressable
          style={({pressed}) => [styles.shutter, pressed && !shutterBusy && {opacity: 0.7}]}
          onPress={capture}
          disabled={shutterBusy}>
          {shutterBusy ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <Text style={styles.shutterText}>拍下此刻</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Image source={{uri: photoUri!}} style={styles.photo} />

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

      <View style={styles.modeRow}>
        <Pressable
          style={({pressed}) => [
            styles.modeBtn,
            inputMode === 'text' && styles.modeBtnActive,
            pressed && {opacity: 0.7},
          ]}
          onPress={() => setInputMode('text')}>
          <Text style={[styles.modeBtnText, inputMode === 'text' && styles.modeBtnTextActive]}>
            文字
          </Text>
        </Pressable>
        <Pressable
          style={({pressed}) => [
            styles.modeBtn,
            inputMode === 'audio' && styles.modeBtnActive,
            pressed && {opacity: 0.7},
          ]}
          onPress={() => setInputMode('audio')}>
          <Text style={[styles.modeBtnText, inputMode === 'audio' && styles.modeBtnTextActive]}>
            录音
          </Text>
        </Pressable>
      </View>

      {inputMode === 'text' ? (
        <TextInput
          style={styles.input}
          placeholder="写一句话…(在这里发生了什么、感受到了什么)"
          placeholderTextColor={Colors.textPlaceholder}
          value={note}
          onChangeText={setNote}
          multiline
        />
      ) : (
        <View style={styles.recordArea}>
          {phase === 'done' ? (
            <View style={styles.doneWrap}>
              <Text style={styles.transResult} numberOfLines={4}>
                {transText || '转录未返回结果'}
              </Text>
              <Pressable
                style={({pressed}) => [styles.reRecordBtn, pressed && {opacity: 0.7}]}
                onPress={reRecord}>
                <Text style={styles.reRecordText}>重录</Text>
              </Pressable>
            </View>
          ) : phase === 'transcribing' ? (
            <View style={styles.transLoadingWrap}>
              <ActivityIndicator size="small" />
              <Text style={styles.transLoadingText}>正在将录音转为文字…</Text>
            </View>
          ) : (
            <Pressable
              style={[
                styles.recordBtn,
                phase === 'recording' && styles.recordBtnActive,
              ]}
              onPressIn={startRecording}
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
          )}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={({pressed}) => [
            styles.btn,
            styles.btnGhost,
            pressed && !shutterBusy && {opacity: 0.7},
          ]}
          onPress={reset}
          disabled={shutterBusy}>
          <Text style={styles.btnGhostText}>重拍</Text>
        </Pressable>
        <Pressable
          style={({pressed}) => [
            styles.btn,
            styles.btnPrimary,
            pressed && canSave && !shutterBusy && {opacity: 0.7},
          ]}
          onPress={save}
          disabled={shutterBusy || !canSave}>
          {saving ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <Text style={styles.btnPrimaryText}>记下</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shutterWrap: {alignItems: 'center', justifyContent: 'center', flex: 1},
  shutter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterText: {color: Colors.onPrimary, fontSize: 18, letterSpacing: 2},
  card: {backgroundColor: Colors.surface, borderRadius: 16, overflow: 'hidden'},
  photo: {width: '100%', height: 320, backgroundColor: Colors.placeholder},
  placeRow: {paddingHorizontal: 16, paddingTop: 14},
  placeLocating: {flexDirection: 'row', alignItems: 'center'},
  placeHint: {marginLeft: 8, color: Colors.textHint},
  place: {fontSize: 15, fontWeight: '600', color: Colors.textPrimary},
  modeRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.track,
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {backgroundColor: Colors.surface},
  modeBtnText: {fontSize: 14, color: Colors.textSecondary},
  modeBtnTextActive: {color: Colors.textPrimary, fontWeight: '600'},
  input: {
    minHeight: 90,
    margin: 16,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    textAlignVertical: 'top',
    color: Colors.textPrimary,
  },
  recordArea: {margin: 16, alignItems: 'center'},
  recordBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.recordRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnText: {color: Colors.onPrimary, fontSize: 16, fontWeight: '600'},
  recordBtnActive: {
    backgroundColor: Colors.recordRedDark,
    transform: [{scale: 0.97}],
  },
  recordingWrap: {alignItems: 'center'},
  recordingDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.recordRed,
    marginBottom: 8,
  },
  recordingHint: {fontSize: 13, color: Colors.textMuted, marginTop: 4},
  transLoadingWrap: {flexDirection: 'row', alignItems: 'center', paddingVertical: 20},
  transLoadingText: {marginLeft: 8, fontSize: 14, color: Colors.textHint},
  doneWrap: {alignItems: 'center'},
  transResult: {
    fontSize: 15,
    lineHeight: 23,
    color: Colors.textPrimary,
    textAlign: 'left',
    backgroundColor: Colors.inputBackground,
    padding: 14,
    borderRadius: 10,
    flexShrink: 1,
    marginBottom: 12,
    maxHeight: 110,
  },
  reRecordBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: Colors.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reRecordText: {color: Colors.textSecondary, fontSize: 14},
  actions: {flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 12},
  btn: {flex: 1, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  btnGhost: {backgroundColor: Colors.track},
  btnGhostText: {color: Colors.textSecondary, fontSize: 16},
  btnPrimary: {backgroundColor: Colors.primary},
  btnPrimaryText: {color: Colors.onPrimary, fontSize: 16},
  savedWrap: {alignItems: 'center', paddingTop: 24, paddingBottom: 24},
  savedText: {fontSize: 18, fontWeight: '600', color: Colors.textPrimary},
});
