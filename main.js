/* ═══════════════════════════════════════
   GlassyWeb Browser — Main Process v2.0
   ═══════════════════════════════════════ */

'use strict';

const { app, BrowserWindow, ipcMain, session, shell, screen, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;

// ── Data persistence paths ─────────────
const DATA_DIR   = path.join(app.getPath('userData'), 'clearglass');
const HIST_FILE  = path.join(DATA_DIR, 'history.json');
const BM_FILE    = path.join(DATA_DIR, 'bookmarks.json');
const SETS_FILE  = path.join(DATA_DIR, 'settings.json');
const DIALS_FILE = path.join(DATA_DIR, 'speeddials.json');
const WINSTATE_FILE = path.join(DATA_DIR, 'winstate.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { console.error('writeJSON error', e); }
}

// ── Default settings (used by settings-get too) ─
const DEFAULT_SETTINGS = {
  homepage: 'newtab',
  userAgent: '',
  searchEngine: 'https://www.google.com/search?q=',
  backgroundType: 'default',
  backgroundUrl: '',
  backgroundPath: '',
  titleBarStyle: 'mac',   // 'mac' | 'windows'
  onboarded: false,
  lastSeenVersion: '',
};

// ══════════════════════════════════════
// SINGLE INSTANCE LOCK + FILE OPEN ARGS
// ══════════════════════════════════════
// Files GlassyWeb knows how to open directly in a tab
const OPENABLE_EXT = ['.html', '.htm', '.pdf', '.txt', '.svg', '.xml'];

let pendingOpenPaths = [];   // queued until renderer says it's ready
let rendererReady = false;

function isOpenablePath(p) {
  if (!p) return false;
  const ext = path.extname(p).toLowerCase();
  return OPENABLE_EXT.includes(ext) && fs.existsSync(p);
}

function toFileUrl(p) {
  let resolved = path.resolve(p).replace(/\\/g, '/');
  if (!resolved.startsWith('/')) resolved = '/' + resolved;
  return 'file://' + encodeURI(resolved).replace(/#/g, '%23');
}

function openPathInBrowser(p) {
  const url = toFileUrl(p);
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-url', url);
    mainWindow.show();
    mainWindow.focus();
  } else {
    pendingOpenPaths.push(url);
  }
}

function extractFilePathsFromArgv(argv) {
  // Skip the executable / '.' entry point and any flags, keep real openable paths
  return argv.filter(a => !a.startsWith('-') && isOpenablePath(a));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const files = extractFilePathsFromArgv(argv);
    files.forEach(openPathInBrowser);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// macOS: user double-clicked / "Open With" a file
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    openPathInBrowser(filePath);
  } else {
    app.whenReady().then(() => openPathInBrowser(filePath));
  }
});

// ══════════════════════════════════════
// WINDOW STATE (position / size / maximized)
// ══════════════════════════════════════
const DEFAULT_WIN_BOUNDS = { width: 1400, height: 900, x: undefined, y: undefined };

function getSavedWindowState() {
  const saved = readJSON(WINSTATE_FILE, null);
  if (!saved) return { bounds: DEFAULT_WIN_BOUNDS, maximized: false, fullscreen: false };

  // Validate the saved bounds are still visible on a connected display,
  // otherwise fall back to defaults (handles disconnected monitors).
  const displays = screen.getAllDisplays();
  const { x, y, width, height } = saved.bounds || {};
  const fitsOnADisplay = typeof x === 'number' && typeof y === 'number' && displays.some(d => {
    const a = d.workArea;
    return x >= a.x - 50 && y >= a.y - 50 && x < a.x + a.width && y < a.y + a.height;
  });

  return {
    bounds: fitsOnADisplay ? saved.bounds : { ...DEFAULT_WIN_BOUNDS, width: width || 1400, height: height || 900 },
    maximized: !!saved.maximized,
    fullscreen: !!saved.fullscreen,
  };
}

let saveStateTimer = null;
function scheduleSaveWindowState() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(saveWindowState, 400);
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const isMaximized  = mainWindow.isMaximized();
  const isFullscreen = mainWindow.isFullScreen();
  // Only persist bounds when in the "normal" state, so we don't save a maximized/full-screen size
  const bounds = (!isMaximized && !isFullscreen) ? mainWindow.getBounds() : readJSON(WINSTATE_FILE, {}).bounds || DEFAULT_WIN_BOUNDS;
  writeJSON(WINSTATE_FILE, { bounds, maximized: isMaximized, fullscreen: isFullscreen });
}

// ── Create Window ──────────────────────
function createWindow() {
  const savedState = getSavedWindowState();

  mainWindow = new BrowserWindow({
    width: savedState.bounds.width || 1400,
    height: savedState.bounds.height || 900,
    x: savedState.bounds.x,
    y: savedState.bounds.y,
    minWidth: 900,
    minHeight: 600,
    show: false, // shown once we've applied the saved maximize/fullscreen state, to avoid a flash
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: false,
      partition: 'persist:clearglass_session',
    },
    titleBarStyle: 'hidden',
    // Windows-specific: proper shadow & rounded corners
    roundedCorners: true,
    icon: path.join(__dirname, 'icon.ico'),
  });

  // On Windows, set proper title for taskbar
  mainWindow.setTitle('GlassyWeb');

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (savedState.fullscreen) mainWindow.setFullScreen(true);
    else if (savedState.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  // Persist window position/size/state so it reopens the same way it was closed
  ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(evt => {
    mainWindow.on(evt, scheduleSaveWindowState);
  });
  mainWindow.on('close', saveWindowState);

  // Send window title updates to renderer
  mainWindow.webContents.on('page-title-updated', (e, title) => {
    e.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send('open-url', url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Track maximize/unmaximize for title bar button state
  mainWindow.on('maximize',   () => mainWindow.webContents.send('window-state', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state', 'normal'));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window-state', 'fullscreen'));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window-state', 'normal'));

  // ── Download handling ──────────────────
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit(); // Sluit dit tweede proces direct af
} else {
  // Als de app al openstond en er wordt elders op een nieuwe link geklikt:
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // Zoek naar een HTTP/HTTPS link in de argumenten van de klik
      const url = commandLine.find(arg => arg.startsWith('http://') || arg.startsWith('https://'));
      if (url) {
        mainWindow.webContents.send('open-url', url); 
      }

      // Check of er alsnog een lokaal bestand (.html/.pdf) werd meegegeven
      const files = extractFilePathsFromArgv(commandLine.slice(app.isPackaged ? 1 : 2));
      files.forEach(openPathInBrowser);
    }
  });
}

// ── App Startup ────────────────────────
app.whenReady().then(async () => {
  // Bypass CSP for all sessions
  const bypassCSP = (sess) => {
    sess.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['content-security-policy'];
      delete headers['Content-Security-Policy'];
      callback({ responseHeaders: { ...headers, 'Content-Security-Policy': [''] } });
    });
  };

  bypassCSP(session.defaultSession);
  bypassCSP(session.fromPartition('persist:clearglass_session'));
  bypassCSP(session.fromPartition('incognito'));

  // Spoof Chrome UA for Chrome Web Store
  const cwsFilter = { urls: ['https://chromewebstore.google.com/*', 'https://clients2.google.com/*'] };
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const gotTheLock = app.requestSingleInstanceLock();

  session.fromPartition('persist:clearglass_session').webRequest.onBeforeSendHeaders(cwsFilter, (details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, 'User-Agent': chromeUA } });
  });
  
  // Also apply to default session for CWS
  session.defaultSession.webRequest.onBeforeSendHeaders(cwsFilter, (details, cb) => {
    cb({ requestHeaders: { ...details.requestHeaders, 'User-Agent': chromeUA } });
  });

  // Handle new window events from webviews — open as new tab
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        mainWindow?.webContents.send('open-url', url);
        return { action: 'deny' };
      });

      // Forward right-click from inside webview to renderer's context menu handler
      contents.on('context-menu', (event, params) => {
        mainWindow?.webContents.send('webview-context-menu', {
          x: params.x,
          y: params.y,
          linkURL: params.linkURL,
          srcURL: params.srcURL,
          selectionText: params.selectionText,
          isEditable: params.isEditable,
          pageURL: params.pageURL,
        });
      });

      // F12 inside webview — undocked so it attaches to the main window
      contents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
          if (contents.isDevToolsOpened()) {
            contents.closeDevTools();
          } else {
            contents.openDevTools({ mode: 'undocked' });
          }
        }
      });
    }
  });

  await loadExtensions();
  createWindow();

  // Windows/Linux: a file path may have been passed as a launch argument
  // (e.g. double-clicking a .html/.pdf file that's associated with GlassyWeb)
  const initialFiles = extractFilePathsFromArgv(process.argv.slice(app.isPackaged ? 1 : 2));
  initialFiles.forEach(openPathInBrowser);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Renderer tells us it's ready to receive queued "open this file" URLs
ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  if (pendingOpenPaths.length && mainWindow && !mainWindow.isDestroyed()) {
    pendingOpenPaths.forEach(url => mainWindow.webContents.send('open-url', url));
    pendingOpenPaths = [];
  }
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

// Set window title from renderer
ipcMain.on('set-window-title', (_, title) => {
  mainWindow?.setTitle(title || 'GlassyWeb');
});

// Open / show downloaded files
ipcMain.on('open-file',  (_, p) => shell.openPath(p));
ipcMain.on('show-file',  (_, p) => shell.showItemInFolder(p));

// ── History ────────────────────────────
ipcMain.handle('history-get', () => readJSON(HIST_FILE, []));
ipcMain.on('history-add', (_, entry) => {
  const hist = readJSON(HIST_FILE, []);
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

// ── Speed Dials ────────────────────────
ipcMain.handle('speeddials-get', () => readJSON(DIALS_FILE, null));
ipcMain.on('speeddials-set', (_, dials) => writeJSON(DIALS_FILE, dials));

// ── Settings ───────────────────────────
ipcMain.handle('settings-get', () => ({ ...DEFAULT_SETTINGS, ...readJSON(SETS_FILE, {}) }));
ipcMain.on('settings-set', (_, s) => {
  const cur = readJSON(SETS_FILE, {});
  writeJSON(SETS_FILE, { ...cur, ...s });
});

const { execSync } = require('child_process');

// Voer dit uit zodra de app opstart
if (app.isPackaged) {
  try {
    // 1. Registreer de protocollen in Electron zelf
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');

    // 2. Dwing de Windows-registersleutels af via PowerShell commando's
    if (process.platform === 'win32') {
      const appId = "GlassyWebHTM";
      const exePath = process.execPath;

      // Maak de ProgID aan en koppel de open-instructie
      execSync(`powershell -Command "New-Item -Path 'HKCU:\\Software\\Classes\\${appId}' -Force | Out-Null"`);
      execSync(`powershell -Command "New-ItemProperty -Path 'HKCU:\\Software\\Classes\\${appId}' -Name '(Default)' -Value 'GlassyWeb Document' -PropertyType String -Force | Out-Null"`);
      execSync(`powershell -Command "New-Item -Path 'HKCU:\\Software\\Classes\\${appId}\\shell\\open\\command' -Force | Out-Null"`);
      execSync(`powershell -Command "New-ItemProperty -Path 'HKCU:\\Software\\Classes\\${appId}\\shell\\open\\command' -Name '(Default)' -Value '\\"${exePath}\\" \\"%1\\"' -PropertyType String -Force | Out-Null"`);

      // Koppel GlassyWeb aan de geregistreerde applicaties voor HTTP en HTTPS
      const capabilitiesPath = `HKCU:\\Software\\Clients\\StartMenuInternet\\GlassyWeb.exe\\Capabilities`;
      execSync(`powershell -Command "New-Item -Path '${capabilitiesPath}\\URLAssociations' -Force | Out-Null"`);
      execSync(`powershell -Command "New-ItemProperty -Path '${capabilitiesPath}' -Name 'ApplicationName' -Value 'GlassyWeb' -PropertyType String -Force | Out-Null"`);
      execSync(`powershell -Command "New-ItemProperty -Path '${capabilitiesPath}\\URLAssociations' -Name 'http' -Value '${appId}' -PropertyType String -Force | Out-Null"`);
      execSync(`powershell -Command "New-ItemProperty -Path '${capabilitiesPath}\\URLAssociations' -Name 'https' -Value '${appId}' -PropertyType String -Force | Out-Null"`);
      
      // Meld de app definitief aan bij Windows
      execSync(`powershell -Command "New-ItemProperty -Path 'HKCU:\\Software\\RegisteredApplications' -Name 'GlassyWeb' -Value 'Software\\Clients\\StartMenuInternet\\GlassyWeb.exe\\Capabilities' -PropertyType String -Force | Out-Null"`);
    }
  } catch (error) {
    console.error("Register bijwerken mislukt:", error);
  }
} else {
  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv || '.')]);
    app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv || '.')]);
  }
}

// ── App version / What's New ────────────
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-last-seen-version', () => {
  const s = readJSON(SETS_FILE, {});
  return s.lastSeenVersion || '';
});
ipcMain.on('set-last-seen-version', (_, v) => {
  const cur = readJSON(SETS_FILE, {});
  writeJSON(SETS_FILE, { ...cur, lastSeenVersion: v });
});

// ── First-run onboarding flag ───────────
ipcMain.handle('onboarding-get', () => {
  const s = readJSON(SETS_FILE, {});
  return !!s.onboarded;
});
ipcMain.on('onboarding-complete', () => {
  const cur = readJSON(SETS_FILE, {});
  writeJSON(SETS_FILE, { ...cur, onboarded: true });
});

// ── Open local file (Ctrl+O) ────────────
ipcMain.handle('open-file-dialog', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Web / Document Files', extensions: ['html', 'htm', 'pdf', 'txt', 'svg', 'xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths.map(toFileUrl);
});

// ── Background image file handling ─────
const BG_DIR = path.join(DATA_DIR, 'backgrounds');
if (!fs.existsSync(BG_DIR)) fs.mkdirSync(BG_DIR, { recursive: true });

ipcMain.handle('bg-save-file', async (_, { name, data }) => {
  try {
    const buffer = Buffer.from(data, 'base64');
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(BG_DIR, safeName);
    fs.writeFileSync(destPath, buffer);
    return { success: true, path: destPath };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('bg-get-file', async (_, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mime = mimeMap[ext] || 'image/jpeg';
    return { success: true, data: data.toString('base64'), mime };
  } catch(e) {
    return { success: false };
  }
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

// ── DevTools ───────────────────────────
ipcMain.on('toggle-devtools-split', (_, wcId) => {
  const { webContents } = require('electron');
  const wc = webContents.fromId(wcId);
  if (!wc) { console.warn('[devtools] no webContents for id', wcId); return; }
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
  } else {
    // 'undocked' docks the devtools window to the main BrowserWindow as a side panel
    wc.openDevTools({ mode: 'undocked' });
  }
});

ipcMain.on('open-devtools', (_, wcId) => {
  const { webContents } = require('electron');
  const wc = webContents.fromId(wcId);
  if (wc) wc.openDevTools({ mode: 'undocked' });
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

// Luister naar ALLE kliks in ALLE web-inhoud (inclusief webviews/sites)
app.on('web-contents-created', (event, contents) => {
  contents.on('before-input-event', (inputEvent, input) => {
    // Check of de gebruiker de linkermuisknop indrukt (mousedown)
    if (input.type === 'mouseDown' && input.button === 'left') {
      // Stuur een seintje naar je browser-schil
      // Let op: vervang 'mainWindow' als jouw venster-variabele anders heet!
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('global-click-detected');
      }
    }
  });
});

// ── Extension install from CWS ─────────
// Listen for CRX download attempts and handle them
ipcMain.handle('install-extension-from-id', async (_, extId) => {
  // This allows installing by extension ID via the CWS
  try {
    const sess = session.fromPartition('persist:clearglass_session');
    // Try loading from the extensions dir if already downloaded
    const extPath = path.join(EXT_DIR, extId);
    if (fs.existsSync(extPath)) {
      await sess.loadExtension(extPath, { allowFileAccess: true });
      return { success: true };
    }
    return { success: false, error: 'Extension folder not found. Please unpack the CRX into the extensions directory.' };
  } catch(e) {
    return { success: false, error: e.message };
  }
});
