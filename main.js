/* ═══════════════════════════════════════
   GlassyWeb Browser — Main Process v2.0
   ═══════════════════════════════════════ */

'use strict';

const { app, BrowserWindow, ipcMain, session, shell, screen, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs   = require('fs');

// ══════════════════════════════════════
// PERFORMANCE / GPU / PRIVACY SWITCHES
// Must be set before the app is ready.
//
// NOTE: --ignore-gpu-blocklist and --enable-native-gpu-memory-buffers
// were removed — forcing GPU features past Chromium's hardware
// blocklist is a known cause of a multi-second (sometimes 10-15s)
// startup stall on machines where the GPU process crashes/restarts
// while trying to honor them before falling back to software
// rendering. The remaining switches are the safe, widely-supported
// performance wins without that risk.
// ══════════════════════════════════════
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-oop-rasterization');
app.commandLine.appendSwitch('canvas-oop-rasterization');

// Anti-Google telemetry / tracking switches
app.commandLine.appendSwitch('disable-features', [
  'PrivacySandboxSettings4',
  'PrivacySandboxAdsAPIsOverride',
  'InterestGroupStorage',
  'AdInterestGroupAPI',
  'Fledge',
  'FledgeBiddingAndAuctionServer',
  'TopicsAPI',
  'AttributionReportingCrossAppWeb',
].join(','));
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('metrics-recording-only');
app.commandLine.appendSwitch('disable-client-side-phishing-detection');

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

// ══════════════════════════════════════
// AD & TRACKER BLOCKLIST
// Network-level blocking — requests to these hosts (and their
// subdomains) never leave the machine.
// ══════════════════════════════════════
const AD_TRACKER_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adnxs.com', 'adsafeprotected.com', 'adsrvr.org', 'adform.net',
  'scorecardresearch.com', 'moatads.com', 'quantserve.com', 'quantcount.com',
  'facebook.net', 'connect.facebook.net', 'fbcdn.net',
  'analytics.twitter.com', 'ads-twitter.com',
  'amazon-adsystem.com', 'criteo.com', 'criteo.net', 'taboola.com',
  'outbrain.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  'bidswitch.net', 'casalemedia.com', 'contextweb.com', 'yieldmo.com',
  'mathtag.com', 'demdex.net', 'everesttech.net', 'bluekai.com',
  'branch.io', 'appsflyer.com', 'mixpanel.com', 'segment.io', 'segment.com',
  'hotjar.com', 'fullstory.com', 'crazyegg.com', 'newrelic.com',
  'nr-data.net', 'sentry.io', 'clarity.ms', 'bing-shopping.com',
  'adservice.google.com', 'pagead2.googlesyndication.com',
  'ads.yahoo.com', 'analytics.yahoo.com',
];
let adBlockEnabled = true; // toggled from Settings

function hostMatchesBlocklist(hostname) {
  if (!hostname) return false;
  return AD_TRACKER_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

function installAdBlocker(sess) {
  sess.webRequest.onBeforeRequest((details, callback) => {
    if (!adBlockEnabled) { callback({ cancel: false }); return; }
    try {
      const hostname = new URL(details.url).hostname;
      if (hostMatchesBlocklist(hostname)) {
        callback({ cancel: true });
        return;
      }
    } catch {}
    callback({ cancel: false });
  });
}

// ── Extensions ─────────────────────────
const EXT_DIR = path.join(app.getPath('userData'), 'glassy', 'extensions');

async function loadExtensions() {
  if (!fs.existsSync(EXT_DIR)) fs.mkdirSync(EXT_DIR, { recursive: true });
  const sess = session.fromPartition('persist:clearglass_session');
  let dirs;
  try { dirs = fs.readdirSync(EXT_DIR); } catch { return; }

  // Load every extension in parallel instead of one at a time, and never
  // block window creation on this — the window shows immediately and
  // extension icons simply pop in a moment later once each one resolves.
  await Promise.all(dirs.map(async (dir) => {
    const extPath = path.join(EXT_DIR, dir);
    try {
      if (fs.statSync(extPath).isDirectory()) {
        await sess.loadExtension(extPath, { allowFileAccess: true });
      }
    } catch (e) {
      console.warn('[ext] failed to load', dir, e.message);
    }
  }));

  mainWindow?.webContents.send('extensions-updated');
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

  // Network-level ad/tracker blocking
  installAdBlocker(session.fromPartition('persist:clearglass_session'));
  installAdBlocker(session.fromPartition('incognito'));
  installAdBlocker(session.defaultSession);

  // Spoof Chrome UA for Chrome Web Store
  const cwsFilter = { urls: ['https://chromewebstore.google.com/*', 'https://clients2.google.com/*'] };
  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

      // Aggressive background throttling — Chromium already throttles
      // hidden renderers' timers/rAF to ~1Hz when this is on; we make sure
      // it's explicitly enabled per-guest instead of relying on the default.
      try { contents.setBackgroundThrottling(true); } catch {}
    }
  });

  createWindow();
  loadExtensions().catch(e => console.warn('[ext] load error', e));

  // RAM Purge hotkey — must be registered after the app is ready
  globalShortcut.register('Ctrl+Alt+R', () => {
    const sess = session.fromPartition('persist:clearglass_session');
    sess.clearCache().catch(() => {});
    mainWindow?.webContents.send('ram-purge-requested');
  });

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
    // We lossen het pad op naar de huidige map of de executable, als een string.
    const pathArg = path.resolve(process.argv[1] || '.');
    
    app.setAsDefaultProtocolClient('http', process.execPath, [pathArg]);
    app.setAsDefaultProtocolClient('https', process.execPath, [pathArg]);
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
  return (sess.getAllExtensions?.() || []).map(e => {
    const manifest = e.manifest || {};
    const icons = manifest.icons || {};
    const iconPath = icons['32'] || icons['48'] || icons['16'] || Object.values(icons)[0] || null;
    const hasPopup = !!(manifest.action?.default_popup || manifest.browser_action?.default_popup);
    return {
      id:          e.id,
      name:        e.name,
      version:     e.version,
      description: manifest.description || '',
      iconUrl:     iconPath ? `chrome-extension://${e.id}/${iconPath.replace(/^\//, '')}` : null,
      hasPopup,
    };
  });
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

// ── Reset Everything (Settings > Danger Zone) ─
ipcMain.handle('reset-all', async () => {
  try {
    writeJSON(SETS_FILE, { ...DEFAULT_SETTINGS }); // also clears onboarded + lastSeenVersion, since those live in settings.json
    writeJSON(HIST_FILE, []);
    adBlockEnabled = true;
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Webview guest preload (fingerprint protection) ─
ipcMain.handle('get-webview-preload-path', () => path.join(__dirname, 'src', 'webview-preload.js'));

// ── Ad blocker toggle ──────────────────
ipcMain.handle('adblock-get', () => adBlockEnabled);
ipcMain.on('adblock-set', (_, enabled) => { adBlockEnabled = !!enabled; });

// ── RAM Purge (Ctrl+Alt+R) ─────────────
ipcMain.handle('ram-purge', async () => {
  try {
    const sess = session.fromPartition('persist:clearglass_session');
    await sess.clearCache();
    // Ask the renderer to hibernate every inactive tab — this is what actually
    // frees the bulk of RAM, since it destroys the underlying webContents.
    mainWindow?.webContents.send('ram-purge-requested');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// ── Extension action popup ─────────────
// Electron doesn't render extension toolbar icons itself; we do that in the
// renderer and, on click, open the extension's declared popup here in a
// small frameless window positioned under the icon — this is the piece that
// was missing, so clicking an extension icon now actually opens its popup.html.
let activeExtPopup = null;

ipcMain.handle('extension-action-click', async (_, { extensionId, x, y, width, height }) => {
  try {
    if (activeExtPopup && !activeExtPopup.isDestroyed()) {
      activeExtPopup.close();
      activeExtPopup = null;
      return { success: true, closed: true };
    }

    const sess = session.fromPartition('persist:clearglass_session');
    const ext = (sess.getAllExtensions?.() || []).find(e => e.id === extensionId);
    if (!ext) return { success: false, error: 'Extension not found' };

    const manifest = ext.manifest || {};
    const popupPath =
      manifest.action?.default_popup ||
      manifest.browser_action?.default_popup ||
      null;

    if (!popupPath) return { success: false, error: 'Extension has no popup' };

    const winBounds = mainWindow.getBounds();
    const popupX = Math.round(winBounds.x + (x || 0));
    const popupY = Math.round(winBounds.y + (y || 0) + (height || 30));

    activeExtPopup = new BrowserWindow({
      width: 360,
      height: 480,
      x: popupX,
      y: popupY,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      parent: mainWindow,
      webPreferences: {
        partition: 'persist:clearglass_session',
        contextIsolation: true,
        sandbox: false,
      },
    });

    activeExtPopup.loadURL(`chrome-extension://${extensionId}/${popupPath.replace(/^\//, '')}`);
    activeExtPopup.once('ready-to-show', () => activeExtPopup.show());
    activeExtPopup.on('blur', () => {
      if (activeExtPopup && !activeExtPopup.isDestroyed()) activeExtPopup.close();
    });
    activeExtPopup.on('closed', () => { activeExtPopup = null; });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
