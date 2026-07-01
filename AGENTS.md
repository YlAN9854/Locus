# Project rules

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

---

## Setup & workflow

- **Package manager:** `pnpm` (read `pnpm-lock.yaml`). README says `npm` — ignore that.
- **`.npmrc`** sets `node-linker=hoisted` to avoid Windows path-too-long errors in native module builds.
- **`.env` file is required** for map functionality. Copy `.env.example` → `.env` and fill `AMAP_ANDROID_KEY` / `AMAP_IOS_KEY`. These are consumed by the `expo-gaode-map` config plugin at build time. `.env` is gitignored.
- **Managed workflow** — `/ios` and `/android` are gitignored. Do not edit native project files; use config plugins in `app.config.js`.

> **Dependency installation is done by the user manually. Do not run `pnpm install`.**

## Commands

| Command                                       | Notes                                     |
| --------------------------------------------- | ----------------------------------------- |
| `pnpm start`                                  | Dev server                                |
| `pnpm lint`                                   | ESLint (`expo lint`)                      |
| `pnpm expo run:android` / `pnpm expo run:ios` | Build + run dev client                    |
| `eas build --profile development`             | Cloud dev build                           |
| `eas build --profile preview`                 | Internal preview build                    |
| `eas build --profile production`              | Production build (auto-increment version) |

**Verification before committing:**

1. `npx tsc --noEmit` — type check (requires `typescript` in devDeps, or use `npx -y -p typescript tsc --noEmit`)
2. `pnpm lint` — ESLint
3. `pnpm expo run:android` / `pnpm expo run:ios` — runtime smoke test

## Out of scope

- **No web support.** Do not add `react-native-web`, `react-dom`, or web-only files (`.web.ts`, `.web.tsx`, `.module.css`, `global.css`). Exception: `external-link.tsx` works on native via `expo-web-browser`.
- **Do not modify native project files** — `/ios` and `/android` are gitignored.
- **No new update operations** — the only write path beyond insert/query/delete is `updateNote(id, text)` for AI transcription back-fill.
- **"Pure local" boundary** — data lives on-device with no account or cloud sync. This does NOT mean offline: map tiles and POI reverse-geocoding still require network.

## Architecture

```
src/
  app/          Expo Router file-based routes (thin re-exports only)
  screens/      Full-page components with all business logic + styles
  components/   Reusable UI (ThemedText, ThemedView, Collapsible, AppTabs, etc.)
  services/     Platform capabilities (location, photo, export) — no UI
  db/           SQLite via expo-sqlite (initDatabase, DAO in records.ts)
  models/       Type definitions (LocusRecord, NewLocusRecord)
  hooks/        useColorScheme, useTheme
  constants/    Colors, Fonts, Spacing tokens
  utils/        Coordinate conversion (GCJ-02 ↔ WGS84)
```

- **Routes are pure re-exports** — e.g. `src/app/index.tsx` does `export {default} from '@/screens/record-screen'`.
- **File naming: kebab-case for all files** (e.g. `record-screen.tsx`, `hint-row.tsx`). Component/function names stay PascalCase (`RecordScreen`).
- **Imports: always use the `@/` alias, never relative paths** — even within the same directory. `@/` maps to `src/`. Defined in `tsconfig.json` paths.
- **Layer boundaries (one-way dependencies)** — `app → screens → components / services / db / hooks → models / utils / constants`. Lower layers never import upper ones. Concretely: `services/` and `db/` must not import from `components/` or `screens/` (no UI in service code), and screens reach data **only** through the `db/` DAO functions — never write SQL or `fetch` directly in a screen.
- **React Compiler** (`reactCompiler: true`) and **typedRoutes** are both enabled in `app.config.js`.

## Initialization order (critical)

In `src/app/_layout.tsx`, the root layout runs two async steps **before rendering any UI**:

1. `ensureAmapPrivacy()` — privacy compliance call **must** happen before any map/location API usage.
2. `initDatabase()` — opens SQLite DB and creates the `records` table.

While initializing, the app shows a spinner. On error, it shows an error screen. Do not move setup before these guards.

## Data model

- **All coordinates are GCJ-02** (Gaode/Mars). Export to WGS84 only in `utils/coords.ts` when producing output files.
- **MVP write paths:** insert, query, delete. One exception — `updateNote(id, text)` for AI transcription back-fill. No other update operations.
- Photos stored as flat files under `documentDir/photos/` with relative paths in the DB, not as blobs.
- Audio recordings stored under `documentDir/audio/` (same pattern as photos). `expo-audio` handles recording/playback.
- **AI transcription** via SiliconFlow API (`services/transcription.ts`). Requires `SILICONFLOW_API_KEY` and `SILICONFLOW_VOICE_MODEL` in `.env`. These are injected into `app.config.js` `extra`, read at runtime via `expo-constants` — NOT `process.env`. Default model: `TeleAI/TeleSpeechASR`.

## UI patterns

- Primary styling: `StyleSheet.create()` with hardcoded hex colors.
- All color/spacing/font tokens are defined in `src/constants/`. Do not hardcode new design values — add a token first.
- `Colors` / `ThemedText` / `ThemedView` exist for light/dark theming but screens do NOT currently use them.
- `global.css` and `Fonts.web` are for **web-only** styling. CSS custom properties are web-specific font stacks.

## React code patterns

- **Derive, don't store** — 能从现有 state 计算的值，不要单独 `useState`。
- **State machines over booleans** — 多步骤流程（拍摄 → 定位 → 编辑 → 转录 → 完成）用 `useReducer` 实现可辨识联合，不用散落布尔值。让不可能的状态无法表示。
- **useRef for non-render values** — 不应触发重渲染的可变数据（草稿、一次性初始化标志）放 `useRef`，不放 `useState`。
- **No manual memoization** — React Compiler 已启用（`reactCompiler: true`）。不要手写 `useCallback` / `useMemo` / `React.memo`，除非有实测需求。让编译器处理。

## Design direction

- **Style:** Minimalism & Swiss Style — clean, functional, lots of white space. The app is a quiet personal tool, not a flashy social product.
- **Color:** Warm near-black primary on off-white background. Blue accent reserved for special actions (export, sync). Recording red. All tokens in `src/constants/colors.ts`.
- **Fonts:** System fonts only (iOS PingFang SC / Android Noto Sans CJK). No custom font loading.
- **Interaction:** Subtle micro-interactions — button press scale, color shift, no over-the-top animations. Follow existing patterns in `components/`.

## Gotchas

These are hard-won lessons from actual builds — an agent would miss them until something breaks.

### `expo-audio` (not `expo-av`) on SDK 56

SDK 56 ships `expo-audio` with a hooks-based API (`useAudioRecorder`, `useAudioPlayer`, `useAudioRecorderState`). `expo-av` is not compatible. The config plugin in `app.config.js` requires `expo-audio` (not `expo-av`), and the module name in `package.json` is `expo-audio`.

### Runtime env vars must go through `app.config.js` extra

Expo `.env` variables are **only** available at build time in `app.config.js` (`process.env.XXX`). They are **not** injected into runtime `process.env`. To use them at runtime, pipe them through `app.config.js` `extra`:

```js
// app.config.js
extra: {
  MY_KEY: process.env.MY_KEY ?? '',
}

// in service code
import Constants from 'expo-constants';
const key = Constants.expoConfig?.extra?.MY_KEY;
```

### RN FormData is broken for file uploads

React Native's `FormData.append` with `{ uri, type, name }` throws `"Unsupported FormDataPart implementation"`. Construct multipart bodies manually with `TextEncoder` + `Uint8Array` instead. See `services/transcription.ts` for the pattern.

### DB migrations must be idempotent

`ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` in SQLite — running it again throws `"duplicate column name"`. Check with `PRAGMA table_info('records')` before executing migration SQL.

### Pressable + conditional render = lost onPressOut

If a `Pressable` with `onPressIn`/`onPressOut` is conditionally replaced by a plain `View` during recording, `onPressOut` never fires. Always keep the `Pressable` mounted, only change its internal content/styles with state.

### useCallback closures — use useRef for mutable data

When `useCallback` captures state that changes during an async operation (e.g. `draft` data in `stopRecording`), use `useRef` to store the mutable value instead. State inside `useCallback` dependencies creates stale closures and complex dependency chains.

### Photo storage: copy from temp, store relative paths

`expo-image-picker` 返回临时 URI，系统可能随时回收。必须立即将文件复制到 `documentDir/photos/`。DB 中只存**相对路径**（如 `photos/{uuid}.jpg`）——绝不存绝对路径，因为应用沙盒前缀在不同安装和 iOS/Android 间会变化。读取时通过当前 `documentDir` 拼接完整路径。

## NL query pipeline testing

The `scripts/` directory contains a device-independent test suite for the natural language query pipeline (LLM decomposition → SQL filtering → embedding search).

```bash
# Step 1: generate ~1000 Shanghai records + embeddings (requires SILICONFLOW_API_KEY, ~3-5 min)
npx tsx scripts/seed.ts

# Step 2: run tests (no API needed except LLM/embedding layers, seconds)
npx tsx scripts/test.ts
```

**Design:** generation and testing are separate — `seed.ts` produces a reusable `scripts/test-output/locus-test.db` (gitignored). `test.ts` loads that DB and runs four test layers: SQL filtering, semantic search, LLM decomposition, end-to-end pipeline. The DB file can also be copied to a device's `documentDir/` to verify map rendering.

**Dependency note:** `better-sqlite3` must be **v12.x** (not v11) — v11 fails to compile on Node 24+ due to V8 API breakage (`v8::Global` constructor signature change). If you see `Could not locate the bindings file`, upgrade: `npm install better-sqlite3@12 --save-dev`.

**Env vars used:** `SILICONFLOW_API_KEY`, `SILICONFLOW_EMBEDDING_MODEL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_CHAT_MODEL`. Scripts load `.env` from the project root via a custom parser (no dotenv dependency).

**Constraints:** these scripts do NOT modify any `src/` code. They import from `src/utils/vector-search.ts` directly (pure JS math). DB operations use `better-sqlite3` (sync API) instead of `expo-sqlite` (async), but SQL statements are identical.

## Development roadmap

代码质量改进的优先级（低风险 → 高收益）：

1. 移除手动 `useCallback`/`useMemo`（React Compiler 已处理）— 零风险。
2. 提取自定义 hook（`useAudioRecording`、`useCaptureDraft`）— 屏幕组件瘦身。
3. Color token 迁移 — 机械性工作。
4. 拍摄流程 state machine 重构 — 高收益但工作量大，等流程更复杂时再做。
