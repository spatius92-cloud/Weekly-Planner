# Weekly Planner React Sandbox

This folder is an isolated React rewrite of the Weekly Planner. It includes the planner board, task editing, move/duplicate actions, member management, filters, progress tracking, PDF export, and local persistence for packaged/offline use.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

## Android and iOS

The native projects are generated in `android/` and `ios/`.

```bash
npm run cap:android
npm run cap:ios
```

Android can be built with Android Studio or Gradle. The iOS project must be opened and built on macOS with Xcode.

## Windows desktop

The Electron wrapper lives in `electron/`.

```bash
npm run desktop:dev
npm run desktop:dist
```

The Windows installer is written to the local `WeeklyPlannerBuild` output directory configured in `electron-builder.config.json`.

This sandbox is not merged into the production app yet. The production app still uses the existing Express API and public client.
