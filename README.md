# 经纬 / Locus

> **每个人都是四维时空里的一条世界线。** 一条由无数"某时某地"的点连成的轨迹。
>
> Locus 帮你把世界线上的点一个一个标记下来——当忆往昔时，可以沿着这条线走回去。
>
> _每一条记录都是世界线上的一个点，点终将连成线。_

---

## 产品简介

**经纬 / Locus** 是一款"为自己而记的、图文 + 时空一体化"的私人生活记录工具。拍照 + 一句话文字 + 自动定位带出地点名，一气呵成；记录过的地点散落在地图上，点开即是当时图文。

**这不是笔记软件，不是社交产品**——没有分享、没有点赞、没有表演。它是你一个人的时空档案。

**MVP 核心闭环：**

| 模块 | 能力                                         |
| ---- | -------------------------------------------- |
| 记录 | 拍照 + 一句话文字 + 自动定位带出地点名       |
| 回看 | 地图视图：记录过的地点散落其上，点开即见图文 |
| 导出 | 一键导出（照片原图 + 带时间地点的可读文件）  |

**关键决策：纯本地存储，无账号，无云同步。** 数据完全属于你，可随时一键带走。正因为"随时能拿走"，你才敢把一生的记忆托付进来。

---

## 设计决策与洞察

### 价值在"回看"，不在"记录"

记录门槛极低，所有 app 都能做。**几个月、几年后能轻松找回并重新被打动，才是产品的灵魂。** 差异化建立在地图回看体验上——去过、记过的地点散落其上，点开即是当时的图文。

### 信任的地基：数据完全属于你

创业 app 平均寿命短，用户凭什么相信它十年后还在？**正因"随时能一键带走"，用户才敢把一生的记忆托付进来。** 这是纯本地 + 一键导出最反直觉但最成立的逻辑。

### 功能的加法是定位的减法

灵感速记、笔记功能技术上无难度，但会把"时空生活记录"的定位稀释成"又一个笔记软件"（红海）。核心场景是**强时空、强感官**的，坚决排除无时空的抽象笔记。

### 为什么是地图，不是力导向图？

力导向图解决"探索关系"，而用户要的是"找回某条记忆"。记忆碎片间往往无强关系，小屏幕上节点易糊成一团。地图才是记忆的自然索引。

### 为什么拍照优先，不是语音？

核心场景（酒吧嘈杂、有朋友在场）不适合语音。自动定位带出地点名直接解决原始痛点，体验上比语音更惊艳。

---

## MVP 验证信号

MVP 成不成立，不看功能多少，看一个信号：

> **你自己和种子用户在记录两三周后，会不会在没有提醒的情况下，主动打开那张地图去翻看？翻看时是否有"对，就是那个晚上"的感觉？**

- **会，且有触动** → 产品立住，可往云同步、提醒、回看花样上加投入。
- **不会** → 再多功能也救不了，需回头重想"回看为什么没打动人"。

---

## 技术栈

| 用途     | 选型                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 框架     | [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) + React Native 0.85 |
| 语言     | TypeScript 6                                                               |
| 路由     | expo-router（文件路由 + typedRoutes）                                      |
| 地图     | 高德地图（expo-gaode-map），GCJ-02 坐标系                                  |
| 本地存储 | expo-sqlite（SQLite，元数据）+ expo-file-system（照片/音频文件）           |
| 录音     | expo-audio（hooks API）                                                    |
| 拍照     | expo-image-picker                                                          |
| AI 转录  | SiliconFlow API（语音转文字）                                              |
| 导出     | expo-sharing + fflate（zip 打包）                                          |

目标平台：**Android + iOS**，无 Web 支持。

---

## 安装与配置

### 前置条件

- Node.js >= 18
- [pnpm](https://pnpm.io/)（包管理器，请勿使用 npm）
- EAS CLI（可选，仅云构建需要）：`npm install -g eas-cli`
- Android Studio 或 Xcode（可选，仅本地构建需要）

### 1. 克隆仓库

```bash
git clone <repo-url>
cd locus
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入真实 Key：

```env
# 高德 Android SDK Key（需包名 com.locus + SHA1 在高德开放平台申请）
AMAP_ANDROID_KEY=your_android_key
# 高德 iOS SDK Key（需 Bundle ID com.locus.app 申请）
AMAP_IOS_KEY=your_ios_key
# 硅基流动 API Key（https://cloud.siliconflow.cn 获取，用于录音转文字）
SILICONFLOW_API_KEY=your_api_key
# 语音转文字模型（默认即可）
SILICONFLOW_VOICE_MODEL=TeleAI/TeleSpeechASR
```

> **注意**：`.env` 已加入 `.gitignore`，不会进仓库。高德 Key 在 EAS 云构建时需在 EAS 项目 Environment Variables 中配置同名变量。

### 3. 安装依赖

```bash
pnpm install
```

> `.npmrc` 设置了 `node-linker=hoisted` 以扁平化 node_modules，避免 Windows 下原生模块构建路径超长。

---

## 启动与运行

### 开发服务器

```bash
pnpm start
```

在输出中选择打开方式（Android 模拟器 / iOS 模拟器 / 物理设备扫码）。

### 本地构建（Dev Client）

```bash
# Android
pnpm expo run:android

# iOS
pnpm expo run:ios
```

> 高德地图等原生模块无法在 Expo Go 中运行，必须使用 Development Build。

### 云构建（EAS）

```bash
eas build --profile development   # 开发构建
eas build --profile preview       # 内部预览
eas build --profile production    # 生产构建（自动递增版本号）
```

---

## 验证与测试

提交代码前请依次执行以下检查：

```bash
# 1. 类型检查
npx tsc --noEmit

# 2. 代码规范检查
pnpm lint

# 3. 运行时冒烟测试
pnpm expo run:android    # 或 pnpm expo run:ios
```

---

## 项目结构

```
src/
  app/          Expo Router 路由声明（thin re-export，无业务逻辑）
  screens/      整页组件 + 业务逻辑 + 样式
  components/   可复用 UI（props 驱动，不含业务逻辑）
  services/     平台能力（定位、拍照、录音、导出、AI 转录）—— 无 UI
  db/           SQLite 访问层（DAO，唯一操作数据库的层）
  models/       类型定义
  hooks/        自定义 hook
  utils/        纯函数工具（坐标转换等）
  constants/    颜色、字体、间距 token
```

**分层依赖（单向流动）**：

```
app → screens → components / services / db / hooks → models / utils / constants
```

关键规则：

- 所有导入使用 `@/` 别名（映射到 `src/`），禁止相对路径
- 文件命名使用 `kebab-case`（如 `record-screen.tsx`），组件名保持 `PascalCase`
- `services/` 和 `db/` 不得引用 UI 层（`components/` / `screens/`）
- 屏幕层取数据只能通过 `db/` 的 DAO，禁止直接写 SQL 或 `fetch`
- React Compiler 已开启（`reactCompiler: true`），无需手写 `useCallback` / `useMemo` / `React.memo`

---

## 后续版本规划

产品验证成立后可考虑（坚决不在第一版做）：

- 基于位置的主动唤醒提醒（再次走到某地附近时，提醒"半年前你在这里…"）
- 时间维度回看（去年的今天 / 人生去过的所有城市地图）
- 云同步与账号体系
- 标签/聚类筛选（记录量增大后）

---

## 相关文档

- [Expo SDK 56 文档](https://docs.expo.dev/versions/v56.0.0/)
