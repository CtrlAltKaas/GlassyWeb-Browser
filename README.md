# Glassy Browser v1.1.0

A glassmorphism Electron browser.

## File Structure

```
glassy-browser/
├── main.js          ← Electron main process
├── preload.js       ← Context bridge (IPC bridge)
├── package.json
└── src/
    ├── index.html   ← Browser shell UI
    ├── browser.js   ← Renderer logic
    └── style.css    ← All styles
```

> **Important:** `index.html`, `browser.js`, and `style.css` all live in `src/`.  
> `main.js` references `src/index.html` via `mainWindow.loadFile('src/index.html')`.

## New in v1.1.0

### ✅ Error Pages
Custom styled error pages for HTTP 400, 402, 403, 404, 500 and network errors
(ERR_CONNECTION_REFUSED, ERR_NAME_NOT_RESOLVED, ERR_INTERNET_DISCONNECTED, etc.)
with Retry / Go Home / Go Back buttons.

### ✅ Full Settings Page (Ctrl+,)
- Homepage URL
- Search engine selector (Google, Bing, DuckDuckGo, Brave, Ecosia, or custom)
- Custom User Agent
- Clear cache & cookies
- Clear history

### ✅ Chrome Extension Support
Extensions are loaded from:
`%APPDATA%/glassy/extensions/` (Windows)
`~/Library/Application Support/glassy/extensions/` (macOS)
`~/.config/glassy/extensions/` (Linux)

Drop any **unpacked** Chrome extension folder there and restart.
Use the Extensions panel (puzzle icon) → "Open Extensions Folder" button.

### ✅ Bookmark System (Ctrl+B)
- Bookmark current page via the ★ button in the URL bar
- Search bookmarks
- Remove individual bookmarks
- Persisted to disk

### ✅ Full History System (Ctrl+H)
- Grouped by Today / Yesterday / date
- Search history
- Remove individual entries
- Clear all history
- Auto-saves on every navigation

### ✅ DevTools
Click the `</>` button in the nav bar to open DevTools for the active webview.

### ✅ Downloads Tray
Click the download icon in the sidebar. Shows progress bars, and Open / Show in Folder buttons when complete.

## Setup

```bash
npm install
npm start
```