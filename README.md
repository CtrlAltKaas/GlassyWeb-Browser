# Glassy Browser (GlassyWeb) v1.2.2

A glassmorphism Electron browser focused on performance, privacy, and UX.

## File Structure

```
glassy-browser/
├── main.js          ← Electron main process
├── preload.js       ← Context bridge (IPC bridge)
├── package.json
└── src/
    ├── index.html          ← Browser shell UI
    ├── browser.js           ← Renderer logic
    ├── style.css            ← All styles
    └── webview-preload.js   ← Guest-page preload (fingerprint protection, dark mode, PiP)
```

> **Important:** `index.html`, `browser.js`, `style.css`, and `webview-preload.js` all live in `src/`.
> `main.js` references `src/index.html` via `mainWindow.loadFile('src/index.html')`, and resolves
> `webview-preload.js`'s path at runtime for the `<webview preload="...">` attribute.

## New in v1.2.2

### ✅ Zero-RAM Tab Hibernation
Tabs that have been inactive past a configurable timeout (default 5 minutes,
Settings → Privacy & Performance) are fully destroyed — not just hidden —
freeing their entire renderer process. The URL and scroll position are saved
first, so clicking back into a hibernated tab silently rebuilds it exactly
where you left off. The active tab, and both panes in Split View, are never
hibernated.

### ✅ Aggressive Background Throttling
Every guest page explicitly gets `setBackgroundThrottling(true)`, so a
background tab's timers/animation frames are throttled the moment it's
hidden — a tab you're not looking at won't compete with a game or other app
for CPU.

### ✅ Optimized GPU Rendering
Zero-copy textures and out-of-process rasterization (`--enable-zero-copy`,
`--enable-gpu-rasterization`, `--enable-oop-rasterization`,
`--canvas-oop-rasterization`) are enabled at launch to offload page and
canvas rendering to the GPU and cut CPU overhead.

### ✅ Network-Level Ad & Tracker Blocker
A curated list of ad/tracker domains is blocked at the network layer
(`session.webRequest.onBeforeRequest`) — the request never leaves your
machine. Toggle it from the new Privacy panel (shield icon) or Settings.

### ✅ Anti-Google Telemetry Switches
Chromium command-line switches disable Privacy Sandbox APIs (Topics,
FLEDGE/Protected Audience, interest-group storage), domain reliability
reporting, background networking pings, and client-side phishing/Safe
Browsing telemetry.

### ✅ Fingerprinting Protection
A dedicated guest-page preload script normalizes `navigator.hardwareConcurrency`
and `deviceMemory`, disables the Battery API, empties `navigator.plugins`, adds
subtle per-session noise to Canvas/AudioContext fingerprinting, masks WebGL
vendor/renderer strings, and limits font-enumeration checks. Toggle in the
Privacy panel — applies to newly opened tabs.

### ✅ Smart Universal Dark Mode
A global toggle darkens any site — but unlike a naive filter, it first checks
each site's real background luminance and **leaves already-dark sites alone**
instead of inverting them into a broken light theme. Only genuinely light
sites get the dark treatment, and only real media (images/video/canvas)
gets counter-inverted so photos still look normal.

### ✅ Native Split-Screen View
Click the split-view button, then pick exactly two open tabs (a banner walks
you through it, Esc cancels) to browse them side by side in one window.

### ✅ Vertical Tabs Sidebar
An opt-in setting moves your tabs to a left-hand sidebar instead of the top
bar — handy on widescreen monitors.

### ✅ RAM Purge Hotkey
**Ctrl+Alt+R** (or Settings → "Purge RAM Now") instantly clears the cache and
hibernates every inactive tab to reclaim memory on demand.

### ✅ Universal Picture-in-Picture
A toolbar button pops the active (or first) video on the page into a
floating, resizable window — works on virtually any site with an HTML5
`<video>` element, not just ones with a built-in PiP button.

### ✅ Extension Popups Actually Open
Installed extensions now get a real icon next to the address bar. Clicking
one opens its actual `popup.html`, positioned under the icon and closing on
blur — just like Chrome. (Previously, extension icons had no click behavior.)

### ✅ New Privacy Panel
A dedicated shield-icon panel for the controls you'll actually reach for
often: ad/tracker blocking, fingerprinting protection, dark mode, and quick
cache/history clearing. Tab hibernation, vertical tabs, and RAM purge remain
in the full Settings page.

### ✅ Window Controls Style Previews
Settings → Browser → "Window Controls Style" now shows a live preview next
to each option — three traffic-light dots for macOS, minimize/maximize/close
rectangles for Windows — instead of plain text labels.

### ✅ Reset Everything
Settings → Danger Zone → "Reset Everything…" clears all settings back to
defaults (which also re-triggers first-run onboarding and the "What's New"
page), and permanently deletes your browsing history. Bookmarks and speed
dials are kept. Requires confirmation.

### ✅ Faster Startup
Removed `--ignore-gpu-blocklist` and `--enable-native-gpu-memory-buffers` —
on many machines these forced GPU features past Chromium's own hardware
blocklist, causing the GPU process to crash and retry (sometimes adding
10-15 seconds to startup) before falling back to software rendering. The
remaining GPU switches keep the performance benefit without that risk.

## Previous: v1.2.1

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

## Notes on Privacy Features

- **Fingerprinting Protection** requires `contextIsolation=no` for guest pages
  to patch `navigator`/`Canvas`/`WebGL` in the page's real JS context, and
  only takes effect on newly opened tabs after toggling it. Dark Mode and
  Picture-in-Picture don't need this and work regardless of the setting.
- **Ad & Tracker Blocker** ships with a curated blocklist in `main.js`
  (`AD_TRACKER_HOSTS`) — add or remove hostnames there to tune it.
- None of these are a substitute for a dedicated privacy browser if that's
  your threat model; they're meant to meaningfully raise the baseline for
  everyday browsing.

## Setup

```bash
npm install
npm start
```

## Build

```bash
npm run build
```
