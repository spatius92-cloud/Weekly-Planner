# Frame & Frqnc — Weekly Planner

A lightweight, shared weekly planner built for the Frame & Frqnc team. Every
member can add, schedule, edit, and track activities across a Monday–Sunday
board, and mark work as **Pending**, **In progress**, or **Completed**.

## Why a website instead of a desktop app

This project is built as a **web app** rather than a native desktop
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

A desktop app would only make sense if the team needed offline-first use
with no server at all, or deep OS integration (system tray, native
notifications, file system access). Neither is a priority for a team
scheduling board, so the web version is the recommended and implemented
approach.

## Features

- Weekly Monday–Sunday board, with navigation to previous/next/current week.
- Add, edit, and delete activities (title, day, time, notes, assignee, status).
- Click an activity's status pill to cycle **Pending → In progress →
  Completed**.
- Team member management (add/remove teammates); each member gets an
  assignable color.
- Filter the board by team member.
- Per-week completion progress bar.
- Data is stored server-side (`data/db.json`) so every teammate sees the
  same board — nothing lives only in one person's browser.

## Getting started

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm start
```

Then open **http://localhost:3000** in a browser. Share that URL (or your
deployed URL) with the team so everyone works off the same planner.

### Opening in VS Code

The repo ships with a `.vscode/` config, so cloning and opening it in VS
Code gets you a ready-to-run project — no manual setup needed.

- **Desktop app:** clone the repo, then `code .` from the project folder
  (or use VS Code's *File → Open Folder…*). On first open you'll be
  prompted to install the recommended extensions (ESLint, Prettier,
  EditorConfig, REST Client) — accept, then run **Terminal → Run Task →
  Start Weekly Planner**, or hit **F5** to launch the server with the
  debugger attached (breakpoints work in `server.js`).
- **Browser, no install:** press `.` on this repo's GitHub page, or go to
  `https://github.dev/spatius92-cloud/Weekly-Planner` to open a full VS
  Code editor in the browser instantly. (Note: github.dev is edit-only —
  it can't run the Node server itself; use it for browsing/editing code,
  and a real machine or a GitHub Codespace to actually run `npm start`.)
- **GitHub Codespaces** (if enabled on the repo): *Code → Codespaces →
  Create codespace* gives you a full cloud VS Code with a terminal, so you
  can `npm install && npm start` and get a forwarded port to the running
  app without installing anything locally.

## Project structure

```
server.js        Express server + REST API, persists to data/db.json
data/db.json      Simple JSON "database" (members + tasks)
public/           Front-end: index.html, styles.css, app.js
```

## API

| Method | Route                     | Description                       |
|--------|---------------------------|------------------------------------|
| GET    | `/api/state`               | Fetch all members and tasks       |
| POST   | `/api/members`             | Add a team member `{ name }`      |
| DELETE | `/api/members/:id`         | Remove a team member              |
| POST   | `/api/tasks`                | Create an activity                |
| PUT    | `/api/tasks/:id`            | Edit an activity                  |
| PATCH  | `/api/tasks/:id/status`     | Update just the status            |
| DELETE | `/api/tasks/:id`            | Delete an activity                |

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
