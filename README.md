# Frame & Frqnc — Weekly Planner

A lightweight, shared weekly planner built for the Frame & Frqnc team. Every
member can add, schedule, edit, and track activities across a Monday–Sunday
board, and mark work as **Pending**, **In progress**, or **Completed**.

## Web, Desktop, and Mobile

The repository contains one React planner client shared by the deployed web
app, Windows desktop packaging through Electron, and Android/iOS packaging
through Capacitor. The Express API and `data/db.json` remain the source of
truth for tasks, team members, and report data.

The app is served from `public/` in production. The React source is in `src/`.

## Why a website instead of a desktop app

This project started as a **web app** rather than a native desktop
application, for a few practical reasons specific to a small team planner:

- **One shared board, always in sync.** The planner's whole point is that
  everyone sees the same activities update in real time. A web app backed
  by a server naturally does this; a desktop app would need its own sync
  layer (or a database server) to avoid everyone having separate,
  out-of-sync local copies.
- **Zero install, any device.** Teammates open a URL from a laptop, phone,
  or tablet — no installers, no OS-specific builds (Windows/macOS/Linux),
  no "please update your app" friction.
- **One place to update.** Ship a fix or a new feature once, on the server,
  and everyone gets it on their next page load — no re-distributing
  installers.
- **Cheaper and easier to host.** A small Node/Express app like this one
  deploys in minutes to services like Render, Railway, Fly.io, or a basic
  VPS, for little to no cost at this scale.

A desktop app is now available for packaged workflows, while the web app
remains the shared online experience.

## Features

- Weekly Monday–Sunday board, with navigation to previous/next/current week.
- Add, edit, and delete activities (title, day, time, notes, assignee, status).
- Click an activity's status pill to cycle **Pending → In progress →
  Completed**.
- Move any pending or in-progress activity to a new date without recreating it.
- Duplicate any activity to another date while keeping the original.
- Team member management (add/remove teammates); each member gets an
  assignable color.
- Filter the board by team member.
- Per-week completion progress bar.
- Export a four-week activity summary to the browser's print dialog for PDF saving.
- Free browser notifications: background push when configured, with local reminders as a fallback while the planner is open.
- Data is stored server-side (`data/db.json`) so every teammate sees the
  same board — nothing lives only in one person's browser.

## Getting started

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in a browser. Share that URL (or your
deployed URL) with the team so everyone works off the same planner.

For development and packaging:

```bash
npm run build
npm run desktop:dev
npm run desktop:dist
npm run cap:android
npm run cap:ios
```

## Project structure

```text
server.js        Express server + REST API, persists to data/db.json
data/db.json     Simple JSON "database" (members + tasks)
src/             React planner source
public/          Built web frontend served by Express and Vercel
android/         Capacitor Android project
ios/             Capacitor iOS project
electron/        Electron desktop wrapper
```

## API

| Method | Route                     | Description                    |
| ------ | -----                     | -----------                    |
| GET    | `/api/state`              | Fetch all members and tasks    |
| POST   | `/api/members`            | Add a team member `{ name }`   |
| DELETE | `/api/members/:id`        | Remove a team member           |
| POST   | `/api/tasks`              | Create an activity             |
| PUT    | `/api/tasks/:id`          | Edit an activity               |
| PATCH  | `/api/tasks/:id/status`   | Update just the status         |
| DELETE | `/api/tasks/:id`          | Delete an activity             |

## Notes & next steps

This is an MVP meant for a small, trusted team (no login/password
authentication yet — anyone with the URL can use it, identifying
themselves via a simple "You are" name picker). Reasonable next steps if
the team grows:

- Add real authentication (e.g. email/password or SSO) and per-user
  permissions.
- Move from the JSON file store to a proper database (Postgres, SQLite)
  for durability under concurrent load.
- Add activity comments/attachments and email or push reminders.

## Deploying

Any Node-friendly host works. Example with Render/Railway-style platforms:

1. Push this repo to GitHub (already done).
2. Create a new Web Service pointing at this repo.
3. Build command: `npm install`. Start command: `npm start`.
4. The app reads `PORT` from the environment automatically.

For persistence beyond a single ephemeral container, mount a persistent
disk for `data/db.json` or migrate to a hosted database as noted above.
