/**
 * 根布局。启动时完成两件事,就绪后再渲染底部双 Tab:
 *  1. 同步高德隐私合规状态(必须在任何地图/定位调用之前)
 *  2. 初始化本地数据库(打开 + 建表)
 *
 * 高德地图/定位 SDK 的 Key 由 expo-gaode-map 的 config plugin 在原生层注入
 * (见 app.config.js,Key 从 .env 读取),因此这里无需再手动 initSDK。
 */
import {DarkTheme, DefaultTheme, ThemeProvider} from 'expo-router';
import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import AppTabs from '@/components/app-tabs';
import {initDatabase} from '@/db/database';
import {ensureAmapPrivacy} from '@/services/location';
import {getErrorMessage} from '@/utils/error';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        ensureAmapPrivacy();
        await initDatabase();
        setReady(true);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>初始化失败</Text>
        <Text style={styles.errDetail}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>经纬 · 启动中</Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  loading: {marginTop: 12, color: '#666'},
  errText: {fontSize: 16, fontWeight: '600', color: '#c00'},
  errDetail: {marginTop: 8, color: '#666', textAlign: 'center'},
});
