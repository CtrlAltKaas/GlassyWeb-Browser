/* ═══════════════════════════════════════
   GlassyWeb Browser — Preload Script v2.0
   ═══════════════════════════════════════ */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize:    () => ipcRenderer.send('window-minimize'),
  maximize:    () => ipcRenderer.send('window-maximize'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  windowClose: () => ipcRenderer.send('window-close'),
  setWindowTitle: (t) => ipcRenderer.send('set-window-title', t),

  // Window state events
  onWindowState: (cb) => ipcRenderer.on('window-state', (_, s) => cb(s)),

  // Open/show files
  openFile: (p) => ipcRenderer.send('open-file', p),
  showFile: (p) => ipcRenderer.send('show-file', p),

  // History
  historyGet:    ()      => ipcRenderer.invoke('history-get'),
  historyAdd:    (entry) => ipcRenderer.send('history-add', entry),
  historyClear:  ()      => ipcRenderer.send('history-clear'),
  historyDelete: (url)   => ipcRenderer.send('history-delete', url),

  // Bookmarks
  bookmarksGet:   ()   => ipcRenderer.invoke('bookmarks-get'),
  bookmarkAdd:    (bm) => ipcRenderer.send('bookmark-add', bm),
  bookmarkRemove: (url)=> ipcRenderer.send('bookmark-remove', url),

  // Speed Dials
  speedDialsGet: ()      => ipcRenderer.invoke('speeddials-get'),
  speedDialsSet: (dials) => ipcRenderer.send('speeddials-set', dials),

  // Settings
  settingsGet: ()  => ipcRenderer.invoke('settings-get'),
  settingsSet: (s) => ipcRenderer.send('settings-set', s),

  // Cache / cookies
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // User agent
  setUserAgent: (ua) => ipcRenderer.send('set-user-agent', ua),
  getUserAgent: ()   => ipcRenderer.invoke('get-user-agent'),

  // DevTools
  toggleDevToolsSplit: (wcId) => ipcRenderer.send('toggle-devtools-split', wcId),
  openDevTools:        (wcId) => ipcRenderer.send('open-devtools', wcId),

  // Extensions
  extensionsList:        ()  => ipcRenderer.invoke('extensions-list'),
  extensionsOpenDir:     ()  => ipcRenderer.invoke('extensions-open-dir'),
  extensionsOpenStore:   ()  => ipcRenderer.send('extensions-open-store'),
  installExtensionById:  (id)=> ipcRenderer.invoke('install-extension-from-id', id),

  // Background image
  bgSaveFile: (name, data) => ipcRenderer.invoke('bg-save-file', { name, data }),
  bgGetFile:  (filePath)   => ipcRenderer.invoke('bg-get-file', filePath),

  // Downloads
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_, d) => cb(d)),
  onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_, d) => cb(d)),
  onDownloadDone:    (cb) => ipcRenderer.on('download-done',    (_, d) => cb(d)),
  
  // Open URL from main
  onOpenUrl: (cb) => ipcRenderer.on('open-url', (_, url) => cb(url)),

  // Webview right-click forwarded from main
  onWebviewContextMenu: (cb) => ipcRenderer.on('webview-context-menu', (_, params) => cb(params)),

  // Default browser
  getDefaultBrowser: () => ipcRenderer.invoke('default-browser-get'),
  setDefaultBrowser: () => ipcRenderer.invoke('default-browser-set'),

  // App version / What's New
  getAppVersion:       () => ipcRenderer.invoke('get-app-version'),
  getLastSeenVersion:  () => ipcRenderer.invoke('get-last-seen-version'),
  setLastSeenVersion:  (v) => ipcRenderer.send('set-last-seen-version', v),

  // First-run onboarding
  onboardingGet:      () => ipcRenderer.invoke('onboarding-get'),
  onboardingComplete: () => ipcRenderer.send('onboarding-complete'),

  // Open local file(s) via native dialog (Ctrl+O)
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // Tell main process the renderer is ready to receive queued "open file" URLs
  rendererReady: () => ipcRenderer.send('renderer-ready'),
});
