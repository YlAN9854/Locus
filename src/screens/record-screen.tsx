import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View} from 'react-native';

import ModeSelector from '@/components/record/mode-selector';
import PhotoCapture from '@/components/record/photo-capture';
import VoiceCapture from '@/components/record/voice-capture';
import VideoCapture from '@/components/record/video-capture';
import type {CaptureMode} from '@/components/record/mode-selector';
import {Colors} from '@/constants/colors';

export default function RecordScreen() {
  const [mode, setMode] = useState<CaptureMode>('photo');

  const renderCapture = () => {
    switch (mode) {
      case 'photo':
        return <PhotoCapture onSaved={() => setMode('photo')} />;
      case 'voice':
        return <VoiceCapture onSaved={() => setMode('voice')} />;
      case 'video':
        return <VideoCapture onSaved={() => setMode('video')} />;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <ModeSelector mode={mode} onChange={setMode} />
        <View style={styles.captureArea}>
          {renderCapture()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, backgroundColor: Colors.pageBackground},
  container: {padding: 16, paddingTop: 8, flexGrow: 1},
  captureArea: {flex: 1, justifyContent: 'center'},
});
