import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Colors} from '@/constants/colors';

export type CaptureMode = 'photo' | 'voice' | 'video';

const MODES: {key: CaptureMode; label: string}[] = [
  {key: 'photo', label: '拍照'},
  {key: 'voice', label: '语音'},
  {key: 'video', label: '视频'},
];

interface Props {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
}

export default function ModeSelector({mode, onChange}: Props) {
  return (
    <View style={styles.row}>
      {MODES.map(m => (
        <Pressable
          key={m.key}
          style={({pressed}) => [
            styles.btn,
            mode === m.key && styles.btnActive,
            pressed && {opacity: 0.7},
          ]}
          onPress={() => onChange(m.key)}>
          <Text style={[styles.text, mode === m.key && styles.textActive]}>
            {m.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.track,
    borderRadius: 10,
    padding: 4,
    gap: 4,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {backgroundColor: Colors.surface},
  text: {fontSize: 14, color: Colors.textSecondary},
  textActive: {color: Colors.textPrimary, fontWeight: '600'},
});
