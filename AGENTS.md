# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

---

## Setup & workflow

- **Package manager:** `pnpm` (read `pnpm-lock.yaml`). README says `npm` — ignore that.
- **`.npmrc`** sets `node-linker=hoisted` to avoid Windows path-too-long errors in native module builds.
- **`.env` file is required** for map functionality. Copy `.env.example` → `.env` and fill `AMAP_ANDROID_KEY` / `AMAP_IOS_KEY`. These are consumed by the `expo-gaode-map` config plugin at build time. `.env` is gitignored.
- **Managed workflow** — `/ios` and `/android` are gitignored. Do not edit native project files; use config plugins in `app.config.js`.
- **Dependency installation** is done by the user manually. Do not run `pnpm install` — the user handles it.

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

## Initialization order (critical)

In `src/app/_layout.tsx`, the root layout runs two async steps **before rendering any UI**:

1. `ensureAmapPrivacy()` — privacy compliance call **must** happen before any map/location API usage.
2. `initDatabase()` — opens SQLite DB and creates the `records` table.

While initializing, the app shows a spinner. On error, it shows an error screen. Do not move setup before these guards.

## Data model

- **All coordinates are GCJ-02** (Gaode/Mars). Export to WGS84 only in `utils/coords.ts` when producing output files.
- **MVP: insert, query, delete, with one exception** — `updateNote(id, text)` exists for AI transcription back-fill. No other update operations.
- Photos stored as flat files under `documentDir/photos/` with relative paths in the DB, not as blobs.
- Audio recordings stored under `documentDir/audio/` (same pattern as photos). `expo-audio` handles recording/playback.
- **AI transcription** via SiliconFlow API (`services/transcription.ts`). Requires `SILICONFLOW_API_KEY` and `SILICONFLOW_VOICE_MODEL` in `.env`. These are injected into `app.config.js` `extra`, read at runtime via `expo-constants` — NOT `process.env`. Default model: `TeleAI/TeleSpeechASR`.

## Platform targets

- **Android and iOS only.** No web support. Do not add `react-native-web`, `react-dom`, or web-only files (`.web.ts`, `.web.tsx`, `.module.css`, `global.css`).
- `external-link.tsx` is an exception — it works on native via `expo-web-browser` and is safe to keep.

## UI patterns

- Primary styling: `StyleSheet.create()` with hardcoded hex colors.
- `Colors` / `ThemedText` / `ThemedView` exist for light/dark theming but screens do NOT currently use them.
- `global.css` and `Fonts.web` are for **web-only** styling. CSS custom properties are web-specific font stacks.

## Design direction

- **Style:** Minimalism & Swiss Style — clean, functional, lots of white space. The app is a quiet personal tool, not a flashy social product.
- **Color:** Warm near-black primary (`#1C1917`) on off-white background (`#FAFAFA`). Blue accent (`#2563EB`) reserved for special actions (export, sync). Recording red (`#E53935`). All tokens in `src/constants/colors.ts`.
- **Fonts:** System fonts only (iOS PingFang SC / Android Noto Sans CJK). No custom font loading.
- **Interaction:** Subtle micro-interactions — button press scale 0.97, color shift, no over-the-top animations.

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
