const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

let httpServer = null;

function serverIsReady() {
  return new Promise((resolve) => {
    const request = http.get('http://127.0.0.1:3000/api/state', (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function startLocalServer() {
  if (await serverIsReady()) return;
  const projectRoot = path.join(__dirname, '..');
  const serverPath = path.join(projectRoot, 'server.js');
  if (!fs.existsSync(serverPath)) return;

  const env = { ...process.env, PORT: '3000' };
  if (app.isPackaged) {
    const databasePath = path.join(app.getPath('userData'), 'db.json');
    const seedPath = path.join(process.resourcesPath, 'seed-db.json');
    if (!fs.existsSync(databasePath) && fs.existsSync(seedPath)) {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
      fs.copyFileSync(seedPath, databasePath);
    }
    env.PLANNER_DB_PATH = databasePath;
  }

  Object.assign(process.env, env);
  const plannerApp = require(serverPath);
  httpServer = await new Promise((resolve, reject) => {
    const listener = plannerApp.listen(3000, () => resolve(listener));
    listener.once('error', reject);
  });
  await waitForServer();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await serverIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f5f6fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await waitForServer();
  window.loadURL('http://127.0.0.1:3000/');
}

app.whenReady().then(async () => {
  await startLocalServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (httpServer) httpServer.close();
});
