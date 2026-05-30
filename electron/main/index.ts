import './env';
import { app, BrowserWindow, shell } from 'electron';
import path from 'path';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function devServerUrl(): string {
  if (!DEV_SERVER_URL) return '';
  const base = DEV_SERVER_URL.replace(/#.*$/, '').replace(/\/?$/, '');
  return `${base}/#/`;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#07060f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[electron] gagal load:', url, code, description);

    const retryUrl = devServerUrl();
    if (retryUrl && url.startsWith('http')) {
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.loadURL(retryUrl);
        }
      }, 1500);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(devServerUrl());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'), { hash: '/' });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
