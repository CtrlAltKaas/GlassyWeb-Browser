/* ═══════════════════════════════════════
   ClearGlass Browser — Preload Script
   ═══════════════════════════════════════ */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  close:      () => ipcRenderer.send('window-minimize-close'),
  minimize:   () => ipcRenderer.send('window-minimize'),
  maximize:   () => ipcRenderer.send('window-maximize'),
  isMaximized:() => ipcRenderer.invoke('is-maximized'),

  // Open/show files
  openFile:  (p)  => ipcRenderer.send('open-file', p),
  showFile:  (p)  => ipcRenderer.send('show-file', p),

  // History
  historyGet:    ()      => ipcRenderer.invoke('history-get'),
  historyAdd:    (entry) => ipcRenderer.send('history-add', entry),
  historyClear:  ()      => ipcRenderer.send('history-clear'),
  historyDelete: (url)   => ipcRenderer.send('history-delete', url),

  // Bookmarks
  bookmarksGet:   ()   => ipcRenderer.invoke('bookmarks-get'),
  bookmarkAdd:    (bm) => ipcRenderer.send('bookmark-add', bm),
  bookmarkRemove: (url)=> ipcRenderer.send('bookmark-remove', url),

  // Settings
  settingsGet: ()  => ipcRenderer.invoke('settings-get'),
  settingsSet: (s) => ipcRenderer.send('settings-set', s),

  // Cache / cookies
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // User agent
  setUserAgent: (ua) => ipcRenderer.send('set-user-agent', ua),
  getUserAgent: ()   => ipcRenderer.invoke('get-user-agent'),

  // DevTools (split-screen toggle)
  toggleDevToolsSplit: (wcId) => ipcRenderer.send('toggle-devtools-split', wcId),
  openDevTools:        (wcId) => ipcRenderer.send('open-devtools', wcId),

  // Extensions
  extensionsList:     ()  => ipcRenderer.invoke('extensions-list'),
  extensionsOpenDir:  ()  => ipcRenderer.invoke('extensions-open-dir'),
  extensionsOpenStore:()  => ipcRenderer.send('extensions-open-store'),

  // Downloads
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_, d) => cb(d)),
  onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_, d) => cb(d)),
  onDownloadDone:    (cb) => ipcRenderer.on('download-done',    (_, d) => cb(d)),

  // Open URL from main
  onOpenUrl: (cb) => ipcRenderer.on('open-url', (_, url) => cb(url)),

  // Window close (actual close)
  windowClose: () => ipcRenderer.send('window-close'),
});