# Glassy Browser v1.2.1

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

## New in v1.3.0

### ✅ Set as Default Browser
Settings → Browser → "Set as Default" registers GlassyWeb as the handler for
`http://` and `https://` links. On Windows, this also opens the Windows
"Default apps" settings page — Windows 10/11 require the final confirmation
click there for security reasons, so GlassyWeb can't do that last step
automatically.

### ✅ First-Run Onboarding
The very first time you launch GlassyWeb, a short setup wizard walks you
through choosing a search engine, picking a window-controls style, and
optionally setting GlassyWeb as your default browser. It only appears once;
you can change any of these choices later in Settings.

### ✅ Windows-Style Window Controls
Settings → Browser → "Window Controls Style" lets you switch between the
default macOS-style traffic-light dots and Windows-style rectangular
minimize/maximize/close buttons on the right side of the tab bar.

### ✅ Tabs Shrink to Fit
Tabs now dynamically resize to fit the available space in the tab bar instead
of overflowing when you have a lot open. Very narrow tabs collapse down to
just their favicon.

### ✅ What's New Page
After an update, GlassyWeb shows a short changelog the next time it launches
(compares the installed version against the last version you saw). You can
also open it any time from Settings → About → "View Changelog".

### ✅ Open Local Files (HTML / PDF / etc.)
- **Ctrl+O** or Settings → Browser → "Open File…" opens a native file picker.
- Double-clicking an associated `.html`/`.htm`/`.pdf` file (once GlassyWeb is
  set as its handler) opens it directly in a new tab, even if GlassyWeb is
  already running.
- PDFs render using Chromium's built-in PDF viewer inside the tab.

### ✅ Remembers Window Position & Size
GlassyWeb now reopens at the same size, position, and maximized/full-screen
state you left it in. If a saved position no longer fits any connected
monitor (e.g. you unplugged a second screen), it safely falls back to the
default size.

## Previous: v1.1.0

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

## Notes on the Default Browser / File Association features

Registering file associations (`.html`, `.htm`, `.pdf`) with the OS only takes
effect in a **packaged, installed** build (via `npm run build`), because it
relies on the NSIS installer writing the appropriate registry entries —
running `npm start` in development won't register them. The `protocols` and
`fileAssociations` blocks are already configured in `package.json` for you.

## Setup

```bash
npm install
npm start
```
