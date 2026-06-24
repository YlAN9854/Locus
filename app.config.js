// Expo 动态配置。替代 app.json,以便从环境变量(.env)读取高德 Key,避免密钥进 git。
//
// - 本地构建:Expo CLI 会自动加载 .env(同名变量注入 process.env)。
// - EAS 云构建:在 EAS 项目的 Environment Variables 里配同名变量。
//
// 注意:高德 Android/iOS SDK Key 会被编进二进制,本就无法对终端用户保密;
// 它靠「包名 + SHA1 / Bundle ID 绑定」防盗用。这里走 .env 仅为「不进仓库 + 多环境切换」。

module.exports = {
  expo: {
    name: 'locus',
    slug: 'locus',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'locus',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/expo.icon',
      bundleIdentifier: 'com.locus.app',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          '经纬需要定位来记录「某时某地」的坐标与地点名',
        NSCameraUsageDescription: '经纬需要相机来拍下此刻的画面',
        NSPhotoLibraryUsageDescription: '经纬需要访问相册以选择照片',
        NSMicrophoneUsageDescription: '经纬需要麦克风来记录此刻的声音',
      },
    },
    android: {
      package: 'com.locus',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.CAMERA',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.ACCESS_WIFI_STATE',
        'android.permission.RECORD_AUDIO',
      ],
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
      'expo-sqlite',
      'expo-sharing',
      [
        'expo-gaode-map',
        {
          androidKey: process.env.AMAP_ANDROID_KEY,
          iosKey: process.env.AMAP_IOS_KEY,
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission: '经纬需要相机来拍下此刻的画面',
          photosPermission: '经纬需要访问相册以选择照片',
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission: '经纬需要麦克风来记录此刻的声音',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY ?? '',
      SILICONFLOW_MODEL: process.env.SILICONFLOW_MODEL ?? 'TeleAI/TeleSpeechASR',
      eas: {
        projectId: 'fdba50ea-28bd-4c44-bcee-739694dc760f',
      },
    },
  },
};
