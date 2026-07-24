const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('node:path');
const { startStaticServer } = require('./staticServer.cjs');

let mainWindow = null;
let pickerWindow = null;
let pendingPickerResolve = null;

const isDev = !!process.env.ELECTRON_START_URL;

function createPickerWindow(sources) {
  return new Promise((resolve) => {
    pendingPickerResolve = resolve;

    pickerWindow = new BrowserWindow({
      width: 560,
      height: 460,
      resizable: false,
      minimizable: false,
      maximizable: false,
      parent: mainWindow ?? undefined,
      modal: true,
      title: 'Choose what to share',
      webPreferences: {
        preload: path.join(__dirname, 'pickerPreload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    pickerWindow.setMenuBarVisibility(false);
    pickerWindow.loadFile(path.join(__dirname, 'picker.html'));

    pickerWindow.webContents.once('did-finish-load', () => {
      pickerWindow?.webContents.send(
        'picker:sources',
        sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() })),
      );
    });

    pickerWindow.on('closed', () => {
      pickerWindow = null;
      if (pendingPickerResolve) {
        pendingPickerResolve(null);
        pendingPickerResolve = null;
      }
    });
  });
}

ipcMain.on('picker:choose', (_event, id) => {
  if (pendingPickerResolve) {
    pendingPickerResolve(id);
    pendingPickerResolve = null;
  }
  pickerWindow?.close();
});

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 300, height: 200 },
      });
      if (sources.length === 0) {
        callback({});
        return;
      }
      const chosenId = sources.length === 1 ? sources[0].id : await createPickerWindow(sources);
      const chosen = sources.find((s) => s.id === chosenId);
      if (!chosen) {
        callback({});
        return;
      }
      // 'loopback' asks Electron/Chromium to also capture system audio where the OS supports it
      // (Windows and some Linux setups; macOS system audio loopback generally isn't available -
      // this mirrors the same OS-level limitation documented for the browser build).
      callback({ video: chosen, audio: 'loopback' });
    } catch (err) {
      console.error('getDisplayMedia handler failed:', err);
      callback({});
    }
  });
}

function setupPermissionHandlers() {
  // StudioBubble only ever asks for camera/mic to power its own recording UI, so we can
  // auto-grant those without a native prompt. Everything else is denied by default.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'StudioBubble',
    backgroundColor: '#0b0d12',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.ELECTRON_START_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const distDir = path.join(__dirname, '..', 'dist');
    const { port } = await startStaticServer(distDir);
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  setupDisplayMediaHandler();
  setupPermissionHandlers();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
