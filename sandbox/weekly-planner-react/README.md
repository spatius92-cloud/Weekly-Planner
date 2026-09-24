# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:


## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
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
