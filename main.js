/* ═══════════════════════════════════════
   ClearGlass Browser — Main Process
   ═══════════════════════════════════════ */

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;

// ── Data persistence paths ─────────────
const DATA_DIR  = path.join(app.getPath('userData'), 'clearglass');
const HIST_FILE = path.join(DATA_DIR, 'history.json');
const BM_FILE   = path.join(DATA_DIR, 'bookmarks.json');
const SETS_FILE = path.join(DATA_DIR, 'settings.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

// ── Create Window ──────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'icon.ico'),
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: false,
      partition: 'persist:glassyweb_session',
    },
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'src', 'images', 'logo.png'),
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send('open-url', url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // ── Download handling ──────────────────
  // Listen on BOTH the default session and the persist session
  const handleDownload = (event, item) => {
    const savePath = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(savePath);
    const dlId = Date.now() + Math.random();

    mainWindow.webContents.send('download-started', {
      id: dlId,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath,
      total: item.getTotalBytes(),
    });

    item.on('updated', (_, state) => {
      mainWindow.webContents.send('download-updated', {
        id: dlId,
        filename: item.getFilename(),
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        state,
      });
    });

    item.once('done', (_, state) => {
      mainWindow.webContents.send('download-done', {
        id: dlId,
        filename: item.getFilename(),
        savePath,
        state,
      });
    });
  };

  session.defaultSession.on('will-download', handleDownload);
  session.fromPartition('persist:clearglass_session').on('will-download', handleDownload);
  // Incognito session downloads
  session.fromPartition('incognito').on('will-download', handleDownload);
}

// ── Extensions ─────────────────────────
const EXT_DIR = path.join(app.getPath('userData'), 'glassy', 'extensions');

async function loadExtensions() {
  if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
  const sess = session.fromPartition('persist:clearglass_session');
  let dirs;
  try { dirs = fs.readdirSync(EXT_DIR); } catch { return; }
  for (const dir of dirs) {
    const extPath = path.join(EXT_DIR, dir);
    if (fs.statSync(extPath).isDirectory()) {
      try { await sess.loadExtension(extPath, { allowFileAccess: true }); }
      catch(e) { console.warn('[ext] failed to load', dir, e.message); }
    }
  }
}

// ── App Startup ────────────────────────
app.whenReady().then(async () => {
  // Bypass CSP
  const bypassCSP = (sess) => {
    sess.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [''],
        },
      });
    });
  };

  bypassCSP(session.defaultSession);
  bypassCSP(session.fromPartition('persist:clearglass_session'));
  bypassCSP(session.fromPartition('incognito'));

  // Spoof Chrome UA for Chrome Web Store so the site loads properly
  const cwsFilter = { urls: ['https://chromewebstore.google.com/*', 'https://clients2.google.com/*'] };
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  session.fromPartition('persist:clearglass_session').webRequest.onBeforeSendHeaders(cwsFilter, (details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, 'User-Agent': chromeUA } });
  });

  // Fix new-window: any webview that tries to open a new OS window gets
  // redirected to a new in-app tab instead.
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        mainWindow?.webContents.send('open-url', url);
        return { action: 'deny' };
      });
    }
  });

  await loadExtensions();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ══════════════════════════════════════
// IPC HANDLERS
// ══════════════════════════════════════

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() ?? false);

// Open / show downloaded files
ipcMain.on('open-file',  (_, p) => shell.openPath(p));
ipcMain.on('show-file',  (_, p) => shell.showItemInFolder(p));

// ── History ────────────────────────────
ipcMain.handle('history-get', () => readJSON(HIST_FILE, []));
ipcMain.on('history-add', (_, entry) => {
  const hist = readJSON(HIST_FILE, []);
  // Avoid duplicate consecutive entries
  if (hist.length && hist[0].url === entry.url) return;
  hist.unshift({ ...entry, timestamp: Date.now() });
  writeJSON(HIST_FILE, hist.slice(0, 2000));
});
ipcMain.on('history-clear', () => writeJSON(HIST_FILE, []));
ipcMain.on('history-delete', (_, url) => {
  writeJSON(HIST_FILE, readJSON(HIST_FILE, []).filter(h => h.url !== url));
});

// ── Bookmarks ──────────────────────────
ipcMain.handle('bookmarks-get', () => readJSON(BM_FILE, []));
ipcMain.on('bookmark-add', (_, bm) => {
  const bms = readJSON(BM_FILE, []);
  if (!bms.find(b => b.url === bm.url)) {
    bms.unshift({ ...bm, added: Date.now() });
    writeJSON(BM_FILE, bms);
  }
});
ipcMain.on('bookmark-remove', (_, url) => {
  writeJSON(BM_FILE, readJSON(BM_FILE, []).filter(b => b.url !== url));
});

// ── Settings ───────────────────────────
ipcMain.handle('settings-get', () => readJSON(SETS_FILE, {
  homepage: 'https://google.com',
  userAgent: '',
  searchEngine: 'https://www.google.com/search?q=',
}));
ipcMain.on('settings-set', (_, s) => {
  const cur = readJSON(SETS_FILE, {});
  writeJSON(SETS_FILE, { ...cur, ...s });
});

// ── Clear cache / cookies ──────────────
ipcMain.handle('clear-cache', async () => {
  await session.fromPartition('persist:clearglass_session').clearCache();
  await session.fromPartition('persist:clearglass_session').clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'cachestorage'],
  });
  return true;
});

// ── User Agent ─────────────────────────
ipcMain.on('set-user-agent', (_, ua) => {
  session.fromPartition('persist:clearglass_session').setUserAgent(ua || app.userAgentFallback);
});
ipcMain.handle('get-user-agent', () =>
  session.fromPartition('persist:clearglass_session').getUserAgent()
);

// ── DevTools (split-screen toggle) ─────
ipcMain.on('toggle-devtools-split', (_, wcId) => {
  const { webContents } = require('electron');
  const wc = webContents.fromId(wcId);
  if (!wc) return;
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
  } else {
    wc.openDevTools({ mode: 'right' });
  }
});

// Keep old handler as alias for F12 in the shell
ipcMain.on('open-devtools', (_, wcId) => {
  const { webContents } = require('electron');
  const wc = webContents.fromId(wcId);
  if (wc) wc.openDevTools({ mode: 'right' });
});

// ── Extensions IPC ─────────────────────
ipcMain.handle('extensions-list', () => {
  const sess = session.fromPartition('persist:clearglass_session');
  return (sess.getAllExtensions?.() || []).map(e => ({
    id:          e.id,
    name:        e.name,
    version:     e.version,
    description: e.manifest?.description || '',
  }));
});

ipcMain.handle('extensions-open-dir', () => {
  if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
  return shell.openPath(EXT_DIR);
});

ipcMain.on('extensions-open-store', () => {
  mainWindow?.webContents.send('open-url', 'https://chromewebstore.google.com');
});