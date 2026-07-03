/* ═══════════════════════════════════════
   GlassyWeb Browser — Renderer Logic v2.0
   ═══════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
let tabs        = [];
let activeTabId = null;
let tabCounter  = 0;
let settings    = {
  homepage: 'newtab',
  searchEngine: 'https://www.google.com/search?q=',
  userAgent: '',
  backgroundType: 'default',
  backgroundUrl: '',
  backgroundPath: '',
};

// Default speed dials
const DEFAULT_SPEED_DIALS = [
  { label: 'YouTube',   url: 'https://youtube.com',        favicon: 'https://cdn.brandfetch.io/idVfYwcuQz/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Discord',   url: 'https://discord.com/app',    favicon: 'https://cdn.brandfetch.io/idM8Hlme1a/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Spotify',   url: 'https://open.spotify.com',   favicon: 'https://cdn.brandfetch.io/id20mQyGeY/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX' },
  { label: 'GitHub',    url: 'https://github.com',         favicon: 'https://cdn.brandfetch.io/idZAyF9rlg/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Netflix',   url: 'https://netflix.com',        favicon: 'https://cdn.brandfetch.io/ideQwN5lBE/w/400/h/400/theme/dark/symbol.png?c=1bxid64Mup7aczewSAYMX' },
  { label: 'Reddit',    url: 'https://reddit.com',         favicon: 'https://cdn.brandfetch.io/idI8jhwP_8/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
];

let speedDials = [...DEFAULT_SPEED_DIALS];

// ══════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════
const tabsContainer  = document.getElementById('tabs-container');
const contentArea    = document.getElementById('content-area');
const urlInput       = document.getElementById('url-input');
const urlLock        = document.getElementById('url-lock');
const btnBack        = document.getElementById('btn-back');
const btnForward     = document.getElementById('btn-forward');
const btnReload      = document.getElementById('btn-reload');
const btnHome        = document.getElementById('btn-home');
const newTabBtn      = document.getElementById('new-tab-btn');
const loadingBar     = document.getElementById('loading-bar');
const panelOverlay   = document.getElementById('panel-overlay');
const suggestionsBox = document.getElementById('url-suggestions');

// ══════════════════════════════════════
// LOADING BAR
// ══════════════════════════════════════
let loadingTimer = null;

function startLoading() {
  loadingBar.classList.add('loading');
  loadingBar.style.width = '65%';
  clearTimeout(loadingTimer);
}

function stopLoading() {
  loadingBar.style.width = '100%';
  loadingTimer = setTimeout(() => {
    loadingBar.classList.remove('loading');
    loadingBar.style.width = '0%';
  }, 320);
}

// ══════════════════════════════════════
// BACKGROUND MANAGEMENT
// ══════════════════════════════════════
async function applyBackground(type, url, filePath) {
  const body = document.body;
  
  if (type === 'default') {
    body.style.backgroundImage = '';
    body.classList.remove('has-custom-bg');
  } else if (type === 'dark') {
    body.style.backgroundImage = 'none';
    body.style.background = '#0a0c14';
    body.classList.remove('has-custom-bg');
  } else if (type === 'url' && url) {
    body.style.backgroundImage = `url('${url}')`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.classList.add('has-custom-bg');
  } else if (type === 'upload' && filePath) {
    try {
      const result = await window.electronAPI?.bgGetFile(filePath);
      if (result?.success) {
        body.style.backgroundImage = `url('data:${result.mime};base64,${result.data}')`;
        body.style.backgroundSize = 'cover';
        body.style.backgroundPosition = 'center';
        body.classList.add('has-custom-bg');
      }
    } catch(e) {
      console.warn('Background load error:', e);
    }
  }
}

// ══════════════════════════════════════
// SPEED DIALS
// ══════════════════════════════════════
async function loadSpeedDials() {
  try {
    const saved = await window.electronAPI?.speedDialsGet();
    if (saved && Array.isArray(saved) && saved.length > 0) {
      speedDials = saved;
    }
  } catch(e) { console.warn('Speed dials load error:', e); }
}

function saveSpeedDials() {
  window.electronAPI?.speedDialsSet(speedDials);
}

// Speed dial modal
let dialEditIndex = -1; // -1 = new

function openDialModal(idx) {
  dialEditIndex = idx;
  const overlay  = document.getElementById('dial-modal-overlay');
  const titleEl  = document.getElementById('dial-modal-title');
  const labelIn  = document.getElementById('dial-modal-label');
  const urlIn    = document.getElementById('dial-modal-url');
  const iconIn   = document.getElementById('dial-modal-icon');
  const deleteBtn= document.getElementById('dial-modal-delete');

  if (idx === -1) {
    // New dial
    titleEl.textContent  = 'Add Speed Dial';
    labelIn.value = '';
    urlIn.value   = '';
    iconIn.value  = '';
    deleteBtn.style.display = 'none';
  } else {
    // Edit existing
    const d = speedDials[idx];
    titleEl.textContent = 'Edit Speed Dial';
    labelIn.value = d.label || '';
    urlIn.value   = d.url   || '';
    iconIn.value  = d.favicon || '';
    deleteBtn.style.display = 'inline-flex';
  }

  overlay.classList.add('open');
  setTimeout(() => labelIn.focus(), 150);
}

function closeDialModal() {
  document.getElementById('dial-modal-overlay').classList.remove('open');
}

document.getElementById('dial-modal-cancel').addEventListener('click', closeDialModal);
document.getElementById('dial-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDialModal();
});

document.getElementById('dial-modal-save').addEventListener('click', () => {
  const label  = document.getElementById('dial-modal-label').value.trim();
  const url    = document.getElementById('dial-modal-url').value.trim();
  const favicon= document.getElementById('dial-modal-icon').value.trim();

  if (!label || !url) { showToast('Label and URL required'); return; }
  const safeUrl = sanitizeUrl(url);

  if (dialEditIndex === -1) {
    speedDials.push({ label, url: safeUrl, favicon: favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeUrl)}&sz=64` });
  } else {
    speedDials[dialEditIndex] = { label, url: safeUrl, favicon: favicon || speedDials[dialEditIndex]?.favicon || '' };
  }

  saveSpeedDials();
  closeDialModal();
  // Refresh any open NTP
  tabs.forEach(t => {
    if (t.ntpEl) {
      const fresh = buildNewTabPage();
      t.ntpEl.replaceWith(fresh);
      t.ntpEl = fresh;
      fresh.style.display = t.id === activeTabId ? 'flex' : 'none';
    }
  });
});

document.getElementById('dial-modal-delete').addEventListener('click', () => {
  if (dialEditIndex < 0 || dialEditIndex >= speedDials.length) return;
  speedDials.splice(dialEditIndex, 1);
  saveSpeedDials();
  closeDialModal();
  tabs.forEach(t => {
    if (t.ntpEl) {
      const fresh = buildNewTabPage();
      t.ntpEl.replaceWith(fresh);
      t.ntpEl = fresh;
      fresh.style.display = t.id === activeTabId ? 'flex' : 'none';
    }
  });
});

// ══════════════════════════════════════
// NEW TAB PAGE
// ══════════════════════════════════════
function buildNewTabPage() {
  const page = document.createElement('div');
  page.className = 'new-tab-page';

  const dialsHtml = speedDials.map((d, i) => `
    <div class="speed-dial" data-idx="${i}">
      <div class="speed-dial-icon">
        ${d.favicon
          ? `<img src="${d.favicon}" alt="${escapeHtml(d.label[0])}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="dial-letter" style="display:none">${escapeHtml(d.label[0])}</div>`
          : `<div class="dial-letter">${escapeHtml(d.label[0])}</div>`
        }
        <button class="speed-dial-edit-btn" data-edit="${i}" title="Edit">✎</button>
      </div>
      <span>${escapeHtml(d.label)}</span>
    </div>
  `).join('');

  page.innerHTML = `
    <div class="ntp-logo">GlassyWeb</div>
    <div class="ntp-search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8"/>
        <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      <input type="text" id="ntp-search-input" placeholder="Search or type a URL…" autocomplete="off" />
    </div>
    <div class="speed-dials">
      ${dialsHtml}
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <button class="speed-dial-add" id="ntp-add-dial" title="Add new speed dial">+</button>
        <span style="font-size:12.5px;color:rgba(255,255,255,0.35);">Add</span>
      </div>
    </div>
  `;

  // Click on speed dial → navigate
  page.querySelectorAll('.speed-dial[data-idx]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('speed-dial-edit-btn') || e.target.closest('.speed-dial-edit-btn')) return;
      navigate(speedDials[+el.dataset.idx].url);
    });
  });

  // Edit button on each dial
  page.querySelectorAll('.speed-dial-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDialModal(+btn.dataset.edit);
    });
  });

  // Add new dial
  page.querySelector('#ntp-add-dial')?.addEventListener('click', () => openDialModal(-1));

  // NTP search
  const ntpInput = page.querySelector('#ntp-search-input');
  if (ntpInput) {
    ntpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = ntpInput.value.trim();
        if (q) navigate(resolveUrl(q));
      }
    });
    setTimeout(() => ntpInput.focus(), 80);
  }

  return page;
}

// ══════════════════════════════════════
// ERROR PAGES
// ══════════════════════════════════════
const ERROR_INFO = {
  400: { title: 'Bad Request',               icon: '⚠️', msg: 'The server could not understand your request due to invalid syntax.' },
  402: { title: 'Payment Required',          icon: '💳', msg: 'This content requires payment or a subscription to access.' },
  403: { title: 'Access Forbidden',          icon: '🔒', msg: "You don't have permission to access this page." },
  404: { title: 'Page Not Found',            icon: '🔍', msg: "The page you're looking for doesn't exist or has been moved." },
  500: { title: 'Internal Server Error',     icon: '🔧', msg: 'The server encountered an unexpected error. Please try again later.' },
  ERR_CONNECTION_REFUSED:   { title: 'Connection Refused',      icon: '🔌', msg: 'The server actively refused the connection. It may be offline.' },
  ERR_NAME_NOT_RESOLVED:    { title: 'Server Not Found',        icon: '🌐', msg: "The DNS lookup failed. Check the URL or your internet connection." },
  ERR_INTERNET_DISCONNECTED:{ title: 'No Internet Connection',  icon: '📡', msg: 'You appear to be offline. Check your network connection.' },
  ERR_TIMED_OUT:            { title: 'Connection Timed Out',    icon: '⏱️', msg: 'The server took too long to respond.' },
  ERR_CERT_AUTHORITY_INVALID:{ title:'Certificate Error',       icon: '🔐', msg: "The site's security certificate is not trusted." },
  ERR_ABORTED:              { title: 'Aborted',                 icon: '❌', msg: 'The navigation was cancelled.' },
};

function buildErrorPage(code, url, description) {
  const info = ERROR_INFO[code] || { title: 'Something Went Wrong', icon: '⚠️', msg: description || 'An unexpected error occurred.' };
  const page = document.createElement('div');
  page.className = 'error-page';
  page.dataset.errorCode = code;
  page.dataset.errorUrl  = url || '';

  page.innerHTML = `
    <div class="error-card">
      <div class="error-icon">${info.icon}</div>
      <div class="error-code">${isNaN(code) ? '' : code}</div>
      <h1 class="error-title">${info.title}</h1>
      <p class="error-msg">${info.msg}</p>
      ${url ? `<p class="error-url">${escapeHtml(url)}</p>` : ''}
      <div class="error-actions">
        <button class="glass-btn accent" id="err-retry">Try Again</button>
        <button class="glass-btn" id="err-home">Go Home</button>
        <button class="glass-btn" id="err-back">Go Back</button>
      </div>
    </div>
  `;

  page.querySelector('#err-retry').addEventListener('click', () => { if (url) navigate(url); });
  page.querySelector('#err-home').addEventListener('click', () => goHome());
  page.querySelector('#err-back').addEventListener('click', () => btnBack.click());

  return page;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════
// TAB MANAGEMENT
// ══════════════════════════════════════
function createTab(url = null) {
  const id = ++tabCounter;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `
    <img class="tab-favicon" src="" alt="" />
    <span class="tab-title">New Tab</span>
    <button class="tab-close" title="Close tab">✕</button>
  `;

  tabEl.addEventListener('click', e => {
    if (!e.target.classList.contains('tab-close')) setActiveTab(id);
  });
  tabEl.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation();
    closeTab(id);
  });

  // Insert before the new-tab button (it's outside tabs-container now, so just append)
  tabsContainer.appendChild(tabEl);

  let webview = null;
  let ntpEl   = null;
  let errorEl = null;

  if (url) {
    webview = createWebview(url, id);
  } else {
    ntpEl = buildNewTabPage();
    ntpEl.dataset.tabId = id;
    contentArea.appendChild(ntpEl);
  }

  tabs.push({ id, tabEl, webview, ntpEl, errorEl, title: 'New Tab', favicon: '', url: url || '' });
  setActiveTab(id);
  resizeTabs();
  return id;
}

// ══════════════════════════════════════
// DYNAMIC TAB WIDTH
// Shrinks tabs to fit the available space instead
// of letting them overflow the tab bar.
// ══════════════════════════════════════
const TAB_MIN_WIDTH  = 44;   // icon + close button only, no title
const TAB_MAX_WIDTH  = 200;
const TAB_GAP        = 4;
const TAB_TITLE_CUTOFF = 110; // below this width, hide the title text

let resizeTabsRaf = null;
function resizeTabs() {
  if (resizeTabsRaf) cancelAnimationFrame(resizeTabsRaf);
  resizeTabsRaf = requestAnimationFrame(() => {
    const count = tabs.length;
    if (!count) return;

    const availWidth = tabsContainer.clientWidth;
    const totalGap = TAB_GAP * (count - 1);
    let width = Math.floor((availWidth - totalGap) / count);
    width = Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, width));

    tabs.forEach(t => {
      t.tabEl.style.width = width + 'px';
      t.tabEl.style.flex  = `0 0 ${width}px`;
      t.tabEl.classList.toggle('tab-compact', width < TAB_TITLE_CUTOFF);
    });
  });
}

window.addEventListener('resize', resizeTabs);

function createWebview(url, tabId) {
  const wv = document.createElement('webview');
  wv.setAttribute('src', sanitizeUrl(url));
  // plugins=yes turns on Chromium's built-in PDF viewer, so .pdf files/links render inline
  wv.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=no,plugins=yes');
  wv.setAttribute('partition', 'persist:clearglass_session');
  wv.dataset.tabId = tabId;
  contentArea.appendChild(wv);
  attachWebviewEvents(wv, tabId);
  return wv;
}

function setActiveTab(id) {
  activeTabId = id;

  tabs.forEach(t => {
    const isActive = t.id === id;
    t.tabEl.classList.toggle('active', isActive);
    if (t.webview) t.webview.classList.toggle('active', isActive);
    if (t.ntpEl)   t.ntpEl.style.display  = isActive ? 'flex' : 'none';
    if (t.errorEl) t.errorEl.style.display = isActive ? 'flex' : 'none';
  });

  const tab = getTab(id);
  if (!tab) return;

  urlInput.value = tab.url || '';
  updateLockIcon(tab.url || '');
  updateNavButtons(tab);

  // Update window title
  const title = tab.title || 'New Tab';
  document.title = `${title} — GlassyWeb`;
  window.electronAPI?.setWindowTitle(`${title} — GlassyWeb`);

  // Focus NTP search if on NTP
  if (tab.ntpEl) {
    const ntpInput = tab.ntpEl.querySelector('#ntp-search-input');
    if (ntpInput) setTimeout(() => ntpInput.focus(), 50);
  }
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  tab.tabEl.classList.add('closing');

  setTimeout(() => {
    tab.tabEl.remove();
    if (tab.webview) tab.webview.remove();
    if (tab.ntpEl)   tab.ntpEl.remove();
    if (tab.errorEl) tab.errorEl.remove();
    tabs.splice(idx, 1);

    if (tabs.length === 0) {
      createTab();
    } else if (activeTabId === id) {
      setActiveTab(tabs[Math.min(idx, tabs.length - 1)].id);
    }
    resizeTabs();
  }, 280);
}

function getTab(id) { return tabs.find(t => t.id === id); }

// ══════════════════════════════════════
// WEBVIEW EVENTS
// ══════════════════════════════════════
function attachWebviewEvents(wv, tabId) {
  // Cache wcId once dom-ready fires — required for devtools to work
  wv.addEventListener('dom-ready', () => {
    try { wv._wcId = wv.getWebContentsId(); }
    catch(e) { console.warn('[devtools] could not get wcId', e); }
  });

  wv.addEventListener('did-start-loading', () => {
    if (tabId === activeTabId) startLoading();
    const tab = getTab(tabId);
    if (!tab || !tab.title || tab.title === 'New Tab') updateTabTitle(tabId, 'Loading…');
    updateReloadBtn(true);
  });

  wv.addEventListener('did-stop-loading', () => {
    if (tabId === activeTabId) stopLoading();
    updateReloadBtn(false);
    setTimeout(() => {
      try {
        const realTitle = wv.getTitle();
        const currentUrl = wv.getURL();
        const tab = getTab(tabId);
        if (!tab) return;
        if (realTitle && realTitle !== 'about:blank' && realTitle !== 'Loading…') {
          updateTabTitle(tabId, realTitle);
        } else if (currentUrl && !currentUrl.startsWith('about:')) {
          try { updateTabTitle(tabId, new URL(currentUrl).hostname.replace(/^www\./, '')); }
          catch { updateTabTitle(tabId, 'Page'); }
        }
      } catch(e) {}
    }, 200);
  });

  // ══════════════════════════════════════
  // WEBVIEW CLICK INTERCEPTION (VEILIGE METHODE)
  // ══════════════════════════════════════
  function hookWebviewClick(webviewEl) {
    // Zodra de gebruiker in de webview klikt, verliest de browser-schil focus 
    // of vuurt de webview een 'blur' / 'focus' event. Dit vangt ELKE klik af.
    webviewEl.addEventListener('focus', () => {
      closeCtxMenu();
    });

    // Extra veiligheid: als de muis over de webview beweegt en er wordt geklikt
    webviewEl.addEventListener('mousedown', () => {
      closeCtxMenu();
    });
  }

  // page-title-updated is the reliable title source
  wv.addEventListener('page-title-updated', (e) => {
    if (e.title && e.title !== 'about:blank') {
      updateTabTitle(tabId, e.title);
    }
  });

  wv.addEventListener('page-favicon-updated', (e) => {
    const favicons = e.favicons || [];
    if (favicons.length > 0) {
      const best = favicons.find(f => f.endsWith('.svg')) ||
                   favicons.find(f => f.endsWith('.png')) ||
                   favicons[0];
      updateTabFavicon(tabId, best);
    }
  });

  wv.addEventListener('did-navigate', ({ url, httpResponseCode }) => {
    updateTabUrl(tabId, url);
    if (httpResponseCode && httpResponseCode >= 400) {
      showErrorPage(tabId, httpResponseCode, url, null);
    } else {
      removeErrorPage(tabId);
    }
    // Fallback favicon — only if no real one loaded yet
    const tab = getTab(tabId);
    if (tab && !tab.faviconIsReal && url && !url.startsWith('about:')) {
      try {
        const domain = new URL(url).hostname;
        updateTabFavicon(tabId, `https://www.google.com/s2/favicons?domain=${domain}&sz=32`, true);
      } catch {}
    }
    // Save to history AFTER title resolves (page-title-updated may come after did-navigate)
    setTimeout(() => {
      const t = getTab(tabId);
      if (!t || !url || url.startsWith('about:')) return;
      const storedTitle = (t.title && t.title !== 'Loading…') ? t.title : url;
      window.electronAPI?.historyAdd({ url, title: storedTitle, favicon: t.favicon || '' });
    }, 900);
  });

  wv.addEventListener('did-navigate-in-page', ({ url }) => {
    updateTabUrl(tabId, url);
  });

  wv.addEventListener('did-fail-load', ({ errorCode, errorDescription, validatedURL, isMainFrame }) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return;
    const errKey = errorDescription || String(errorCode);
    showErrorPage(tabId, errKey, validatedURL, errorDescription);
  });

  wv.addEventListener('new-window', ({ url }) => {
    createTab(url);
  });
}

function showErrorPage(tabId, code, url, desc) {
  const tab = getTab(tabId);
  if (!tab) return;
  if (tab.errorEl) { tab.errorEl.remove(); tab.errorEl = null; }
  if (tab.webview) tab.webview.style.display = 'none';
  const errEl = buildErrorPage(code, url, desc);
  errEl.dataset.tabId = tabId;
  errEl.style.display = tabId === activeTabId ? 'flex' : 'none';
  contentArea.appendChild(errEl);
  tab.errorEl = errEl;
}

function removeErrorPage(tabId) {
  const tab = getTab(tabId);
  if (!tab || !tab.errorEl) return;
  tab.errorEl.remove();
  tab.errorEl = null;
  if (tab.webview) tab.webview.style.display = '';
}

// ══════════════════════════════════════
// TAB STATE HELPERS
// ══════════════════════════════════════
function updateTabTitle(id, title) {
  const t = getTab(id);
  if (!t) return;
  t.title = title;
  const titleEl = t.tabEl.querySelector('.tab-title');
  if (titleEl) titleEl.textContent = title;
  if (id === activeTabId) {
    document.title = `${title} — GlassyWeb`;
    window.electronAPI?.setWindowTitle(`${title} — GlassyWeb`);
  }
}

function updateTabFavicon(id, faviconUrl, isFallback = false) {
  const t = getTab(id);
  if (!t || !faviconUrl) return;
  // Don't overwrite a real favicon with a fallback
  if (isFallback && t.faviconIsReal) return;
  t.favicon = faviconUrl;
  if (!isFallback) t.faviconIsReal = true;
  const img = t.tabEl.querySelector('.tab-favicon');
  if (!img) return;
  img.style.display = ''; // clear any inline override
  img.src = faviconUrl;
  img.onload  = () => img.classList.add('loaded');
  img.onerror = () => {
    img.classList.remove('loaded');
    // Try Google favicon service as last resort
    if (!faviconUrl.includes('google.com/s2/favicons') && t.url) {
      try {
        const domain = new URL(t.url).hostname;
        img.onerror = () => img.classList.remove('loaded');
        img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        img.onload = () => img.classList.add('loaded');
      } catch {}
    }
  };
}

function updateTabUrl(id, url) {
  const t = getTab(id);
  if (!t) return;
  t.url = url;
  if (id === activeTabId) {
    urlInput.value = url;
    updateLockIcon(url);
    updateNavButtons(t);
  }
}

function updateReloadBtn(isLoading) {
  btnReload.innerHTML = isLoading
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 15a9 9 0 1 0 .49-4.02" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btnReload.title = isLoading ? 'Stop (Esc)' : 'Reload (Ctrl+R)';
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function goHome() {
  if (settings.homepage === 'newtab') {
    const tab = getTab(activeTabId);
    if (!tab) return;
    removeErrorPage(activeTabId);
    if (tab.webview) { tab.webview.remove(); tab.webview = null; }
    if (!tab.ntpEl) {
      const ntpEl = buildNewTabPage();
      ntpEl.dataset.tabId = tab.id;
      ntpEl.style.display = 'flex';
      contentArea.appendChild(ntpEl);
      tab.ntpEl = ntpEl;
    }
    tab.ntpEl.style.display = 'flex';
    tab.url = '';
    urlInput.value = '';
    updateLockIcon('');
    updateTabTitle(tab.id, 'New Tab');
    const ntpSearch = tab.ntpEl.querySelector('#ntp-search-input');
    if (ntpSearch) setTimeout(() => ntpSearch.focus(), 60);
  } else {
    navigate(settings.homepage || 'https://google.com');
  }
}

function navigate(url) {
  const tab = getTab(activeTabId);
  if (!tab) return;

  const safeUrl = sanitizeUrl(url);

  removeErrorPage(activeTabId);

  if (tab.ntpEl) {
    tab.ntpEl.remove();
    tab.ntpEl = null;
    tab.webview = createWebview(safeUrl, tab.id);
    tab.webview.classList.add('active');
  } else if (tab.webview) {
    tab.webview.setAttribute('src', safeUrl);
    tab.webview.style.display = '';
  } else {
    tab.webview = createWebview(safeUrl, tab.id);
    tab.webview.classList.add('active');
  }

  tab.url = safeUrl;
  tab.favicon = '';
  tab.faviconIsReal = false;
  const favicon = tab.tabEl.querySelector('.tab-favicon');
  if (favicon) { favicon.classList.remove('loaded'); favicon.src = ''; }
  urlInput.value = safeUrl;
  updateLockIcon(safeUrl);
}

function resolveUrl(input) {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^localhost(:\d+)?/i.test(trimmed) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) return `http://${trimmed}`;
  if (/^[\w-]+(\.[\w-]{2,}){1,}(\/.*)?$/.test(trimmed) && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `${settings.searchEngine}${encodeURIComponent(trimmed)}`;
}

function sanitizeUrl(url) {
  if (!url || url === 'about:blank') return 'about:blank';
  try { return new URL(url).href; } catch { return resolveUrl(url); }
}

function updateLockIcon(url) {
  const secure = /^https:\/\//i.test(url);
  const none   = !url || url === 'about:blank' || url === '';
  urlLock.classList.toggle('secure',   secure);
  urlLock.classList.toggle('insecure', !secure && !none);
  urlLock.classList.toggle('none',     none);
  urlLock.title = secure ? 'Secure connection' : none ? '' : 'Not secure';
}

function updateNavButtons(tab) {
  if (!tab?.webview) {
    btnBack.disabled = btnForward.disabled = true;
    return;
  }
  try {
    btnBack.disabled    = !tab.webview.canGoBack?.();
    btnForward.disabled = !tab.webview.canGoForward?.();
  } catch {
    btnBack.disabled = btnForward.disabled = true;
  }
}

// ══════════════════════════════════════
// NAV BUTTONS
// ══════════════════════════════════════
btnBack.addEventListener('click', () => {
  const t = getTab(activeTabId);
  if (t?.webview?.canGoBack?.()) t.webview.goBack();
});

btnForward.addEventListener('click', () => {
  const t = getTab(activeTabId);
  if (t?.webview?.canGoForward?.()) t.webview.goForward();
});

btnReload.addEventListener('click', () => {
  const t = getTab(activeTabId);
  if (!t?.webview) return;
  try {
    if (t.webview.isLoading?.()) t.webview.stop();
    else t.webview.reload();
  } catch(e) { console.warn('Reload error:', e); }
});

btnHome.addEventListener('click', () => goHome());

// ══════════════════════════════════════
// URL BAR
// ══════════════════════════════════════
urlInput.addEventListener('keydown', e => {
  const items = suggestionsBox.querySelectorAll('.suggestion-item');
  let selectedIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));

  if (!suggestionsBox.classList.contains('visible') || items.length === 0) {
    if (e.key === 'Enter') { navigate(resolveUrl(urlInput.value.trim())); urlInput.blur(); }
    if (e.key === 'Escape') { urlInput.blur(); }
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[selectedIndex]?.classList.remove('selected');
    selectedIndex = (selectedIndex + 1) % items.length;
    items[selectedIndex].classList.add('selected');
    urlInput.value = items[selectedIndex].querySelector('.suggestion-url').textContent;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[selectedIndex]?.classList.remove('selected');
    selectedIndex = (selectedIndex - 1 + items.length) % items.length;
    items[selectedIndex].classList.add('selected');
    urlInput.value = items[selectedIndex].querySelector('.suggestion-url').textContent;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const active = items[selectedIndex];
    if (active) {
      const targetUrl = active.querySelector('.suggestion-url').textContent;
      urlInput.value = targetUrl;
      navigate(targetUrl);
    } else {
      navigate(resolveUrl(urlInput.value.trim()));
    }
    suggestionsBox.classList.remove('visible');
    urlInput.blur();
  } else if (e.key === 'Escape') {
    suggestionsBox.classList.remove('visible');
    urlInput.blur();
  }
});

urlInput.addEventListener('focus', () => urlInput.select());

document.getElementById('url-go-btn').addEventListener('click', () => {
  navigate(resolveUrl(urlInput.value.trim()));
});

document.getElementById('btn-bookmark-cur').addEventListener('click', () => {
  const tab = getTab(activeTabId);
  if (!tab || !tab.url) return;
  window.electronAPI?.bookmarkAdd({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon || '' });
  showToast('Bookmark saved!');
  renderBookmarks();
});

// ══════════════════════════════════════
// NEW TAB + WINDOW CONTROLS
// ══════════════════════════════════════
newTabBtn.addEventListener('click', () => createTab());
document.getElementById('btn-close').addEventListener('click', () => window.electronAPI?.windowClose());
document.getElementById('btn-min').addEventListener('click',   () => window.electronAPI?.minimize());
document.getElementById('btn-max').addEventListener('click',   () => window.electronAPI?.maximize());

// Update max button icon on state change
window.electronAPI?.onWindowState(state => {
  const btn = document.getElementById('btn-max');
  if (!btn) return;
  // Update tooltip
  btn.title = state === 'maximized' ? 'Restore' : 'Maximize';
});

// ── Window controls style (macOS dots vs Windows rectangles) ──
function applyTitleBarStyle(style) {
  const shell = document.getElementById('browser-shell');
  if (!shell) return;
  shell.classList.toggle('titlebar-windows', style === 'windows');
  shell.classList.toggle('titlebar-mac', style !== 'windows');
  resizeTabs();
}

// ══════════════════════════════════════
// PANELS
// ══════════════════════════════════════
let activePanel = null;

function openPanel(name) {
  if (activePanel === name) { closePanel(); return; }
  closePanel(false);
  activePanel = name;
  document.getElementById(`panel-${name}`)?.classList.add('open');
  panelOverlay.classList.add('visible');

  if (name === 'downloads')  renderDownloads();
  if (name === 'history')    renderHistory();
  if (name === 'bookmarks')  renderBookmarks();
  if (name === 'extensions') renderExtensions();
  if (name === 'settings')   loadSettingsUI();
}

function closePanel(clearActive = true) {
  document.querySelectorAll('.side-panel.open').forEach(p => p.classList.remove('open'));
  panelOverlay.classList.remove('visible');
  if (clearActive) activePanel = null;
}

panelOverlay.addEventListener('click', closePanel);

document.querySelectorAll('.panel-trigger').forEach(btn => {
  btn.addEventListener('click', () => openPanel(btn.dataset.panel));
});

document.querySelectorAll('.panel-close-btn').forEach(btn => {
  btn.addEventListener('click', () => closePanel());
});

// ── DevTools (fixed) ─────────────────
document.getElementById('btn-devtools').addEventListener('click', () => {
  const tab = getTab(activeTabId);
  if (!tab?.webview) {
    showToast('Navigate to a page first to open DevTools');
    return;
  }
  // Use cached wcId from dom-ready, or try live
  const wcId = tab.webview._wcId ?? (() => {
    try { return tab.webview.getWebContentsId(); } catch { return null; }
  })();
  if (wcId != null) {
    window.electronAPI?.toggleDevToolsSplit(wcId);
  } else {
    // Webview not ready yet — wait for dom-ready then open
    showToast('Waiting for page to load…');
    tab.webview.addEventListener('dom-ready', function handler() {
      tab.webview.removeEventListener('dom-ready', handler);
      try {
        const id = tab.webview.getWebContentsId();
        tab.webview._wcId = id;
        window.electronAPI?.toggleDevToolsSplit(id);
      } catch(e) { console.warn('DevTools retry error:', e); }
    });
  }
});

// ══════════════════════════════════════
// HISTORY
// ══════════════════════════════════════
async function renderHistory(filter = '') {
  const list = document.getElementById('history-list');
  const items = await window.electronAPI?.historyGet() || [];
  const filtered = filter
    ? items.filter(h => h.url?.toLowerCase().includes(filter) || h.title?.toLowerCase().includes(filter))
    : items;

  if (!filtered.length) {
    list.innerHTML = '<div class="panel-empty">No history yet</div>';
    return;
  }

  const groups = {};
  filtered.forEach(h => {
    const d = new Date(h.timestamp);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday'
      : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });

  list.innerHTML = Object.entries(groups).map(([date, entries]) => `
    <div class="history-group">
      <div class="history-date">${date}</div>
      ${entries.map(h => `
        <div class="panel-item history-item" data-url="${escapeHtml(h.url || '')}">
          <img class="panel-favicon" src="${h.favicon || ''}" onerror="this.style.display='none'" />
          <div class="panel-item-info">
            <div class="panel-item-title">${escapeHtml(h.title || h.url || '')}</div>
            <div class="panel-item-url">${escapeHtml(h.url || '')}</div>
          </div>
          <button class="panel-item-del" data-url="${escapeHtml(h.url || '')}">✕</button>
        </div>
      `).join('')}
    </div>
  `).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('panel-item-del')) return;
      navigate(el.dataset.url); closePanel();
    });
  });
  list.querySelectorAll('.panel-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.electronAPI?.historyDelete(btn.dataset.url);
      btn.closest('.panel-item').remove();
    });
  });
}

document.getElementById('history-search').addEventListener('input', e => renderHistory(e.target.value.toLowerCase()));
document.getElementById('btn-history-clear').addEventListener('click', () => {
  if (!confirm('Clear all browsing history?')) return;
  window.electronAPI?.historyClear();
  renderHistory();
});
document.getElementById('btn-clear-hist-s')?.addEventListener('click', () => {
  if (!confirm('Clear all browsing history?')) return;
  window.electronAPI?.historyClear();
  showToast('History cleared');
});

function isToday(d) {
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}
function isYesterday(d) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
}

// ══════════════════════════════════════
// BOOKMARKS
// ══════════════════════════════════════
async function renderBookmarks(filter = '') {
  const list = document.getElementById('bookmarks-list');
  const items = await window.electronAPI?.bookmarksGet() || [];
  const filtered = filter
    ? items.filter(b => b.url?.toLowerCase().includes(filter) || b.title?.toLowerCase().includes(filter))
    : items;

  if (!filtered.length) {
    list.innerHTML = '<div class="panel-empty">No bookmarks yet.<br>Click the ★ in the URL bar to save one.</div>';
    return;
  }

  list.innerHTML = filtered.map(b => `
    <div class="panel-item" data-url="${escapeHtml(b.url || '')}">
      <img class="panel-favicon" src="${b.favicon || ''}" onerror="this.style.display='none'" />
      <div class="panel-item-info">
        <div class="panel-item-title">${escapeHtml(b.title || b.url || '')}</div>
        <div class="panel-item-url">${escapeHtml(b.url || '')}</div>
      </div>
      <button class="panel-item-del" data-url="${escapeHtml(b.url || '')}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.panel-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('panel-item-del')) return;
      navigate(el.dataset.url); closePanel();
    });
  });
  list.querySelectorAll('.panel-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.electronAPI?.bookmarkRemove(btn.dataset.url);
      btn.closest('.panel-item').remove();
    });
  });
}

document.getElementById('bookmarks-search').addEventListener('input', e => renderBookmarks(e.target.value.toLowerCase()));

// ══════════════════════════════════════
// EXTENSIONS
// ══════════════════════════════════════
async function renderExtensions() {
  const list = document.getElementById('extensions-list');
  list.innerHTML = '<div class="panel-empty" style="opacity:0.5;">Loading extensions…</div>';

  let exts = [];
  try { exts = await window.electronAPI?.extensionsList() || []; }
  catch(e) { console.warn('extensions-list error', e); }

  if (!exts.length) {
    list.innerHTML = `
      <div class="panel-empty" style="text-align:left;padding:8px 0;">
        <p style="margin-bottom:8px;">No extensions installed yet.</p>
        <p style="font-size:12px;opacity:0.6;line-height:1.55;">
          To install via Chrome Web Store: open the store with the button above,
          find an extension, and click <strong>Add to Chrome</strong>.<br><br>
          For manual install: drop an unpacked extension folder into the extensions
          directory and restart.
        </p>
      </div>`;
    return;
  }

  list.innerHTML = exts.map(ext => `
    <div class="panel-item ext-item">
      <div class="ext-icon">🧩</div>
      <div class="panel-item-info">
        <div class="panel-item-title">${escapeHtml(ext.name)} <span class="ext-ver">v${escapeHtml(ext.version)}</span></div>
        <div class="panel-item-url">${escapeHtml(ext.description || '')}</div>
      </div>
    </div>
  `).join('');
}

document.getElementById('btn-open-ext-dir').addEventListener('click', () => window.electronAPI?.extensionsOpenDir());
document.getElementById('btn-open-ext-store').addEventListener('click', () => {
  window.electronAPI?.extensionsOpenStore();
  closePanel();
});

// ══════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════
async function loadSettingsUI() {
  const s = await window.electronAPI?.settingsGet() || {};
  settings = { ...settings, ...s };

  // Homepage
  const hpSelect = document.getElementById('set-homepage');
  const customHpRow = document.getElementById('custom-homepage-row');
  if (s.homepage === 'newtab' || !s.homepage) {
    hpSelect.value = 'newtab';
  } else if (s.homepage === 'https://google.com') {
    hpSelect.value = 'https://google.com';
  } else {
    hpSelect.value = 'custom';
    document.getElementById('set-homepage-custom').value = s.homepage;
    customHpRow.style.display = '';
  }

  // Search engine
  const searchSelect = document.getElementById('set-search');
  const knownEngines = Array.from(searchSelect.options).map(o => o.value).filter(v => v !== 'custom');
  if (knownEngines.includes(s.searchEngine)) {
    searchSelect.value = s.searchEngine;
  } else if (s.searchEngine) {
    searchSelect.value = 'custom';
    document.getElementById('set-search-custom').value = s.searchEngine;
    document.getElementById('custom-search-row').style.display = '';
  }

  // User agent
  document.getElementById('set-ua').value = s.userAgent || '';
  const ua = await window.electronAPI?.getUserAgent() || 'Default';
  document.getElementById('current-ua').textContent = ua.length > 80 ? ua.slice(0, 80) + '…' : ua;

  // Background
  const bgType = s.backgroundType || 'default';
  document.querySelectorAll('.bg-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === bgType);
  });
  updateBgRows(bgType);

  if (bgType === 'url') document.getElementById('set-bg-url').value = s.backgroundUrl || '';

  // Update preview
  updateBgPreview(bgType, s.backgroundUrl, s.backgroundPath);

  // Window controls style
  const tbStyle = s.titleBarStyle || 'mac';
  document.querySelectorAll('#panel-settings [data-titlebar]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.titlebar === tbStyle);
  });

  // Default browser status
  refreshDefaultBrowserStatus();

  // About / version
  const version = await window.electronAPI?.getAppVersion();
  if (version) document.getElementById('about-version').textContent = `GlassyWeb v${version}`;
}

async function refreshDefaultBrowserStatus() {
  const statusEl = document.getElementById('default-browser-status');
  if (!statusEl) return;
  const isDefault = await window.electronAPI?.getDefaultBrowser();
  statusEl.textContent = isDefault ? '✓ GlassyWeb is your default browser' : 'Not your default browser';
}

// Window controls style buttons (in Settings)
document.querySelectorAll('#panel-settings [data-titlebar]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#panel-settings [data-titlebar]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const style = btn.dataset.titlebar;
    settings.titleBarStyle = style;
    window.electronAPI?.settingsSet({ titleBarStyle: style });
    applyTitleBarStyle(style);
    showToast(style === 'windows' ? 'Windows-style controls enabled' : 'macOS-style controls enabled');
  });
});

// Set as default browser
document.getElementById('btn-set-default-browser')?.addEventListener('click', async () => {
  const result = await window.electronAPI?.setDefaultBrowser();
  if (result?.requiresManualConfirm) {
    showToast('Finish setup in Windows Settings, then come back');
  } else if (result?.success) {
    showToast('GlassyWeb set as default browser');
  } else {
    showToast('Could not set as default: ' + (result?.error || 'unknown error'));
  }
  setTimeout(refreshDefaultBrowserStatus, 1200);
});

// Open a local file (also available via Ctrl+O)
document.getElementById('btn-open-file')?.addEventListener('click', async () => {
  const urls = await window.electronAPI?.openFileDialog();
  (urls || []).forEach(u => createTab(u));
});

// View changelog on demand
document.getElementById('btn-show-whatsnew')?.addEventListener('click', () => {
  closePanel();
  showWhatsNew(true);
});

document.getElementById('set-homepage').addEventListener('change', function() {
  document.getElementById('custom-homepage-row').style.display = this.value === 'custom' ? '' : 'none';
});

document.getElementById('set-search').addEventListener('change', function() {
  document.getElementById('custom-search-row').style.display = this.value === 'custom' ? '' : 'none';
});

// Background type buttons
document.querySelectorAll('.bg-option').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.bg-option').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    updateBgRows(this.dataset.bg);
  });
});

function updateBgRows(type) {
  document.getElementById('bg-url-row').style.display    = type === 'url'    ? '' : 'none';
  document.getElementById('bg-upload-row').style.display = type === 'upload'  ? '' : 'none';
}

function updateBgPreview(type, url, filePath) {
  const preview = document.getElementById('bg-preview');
  if (type === 'default') {
    preview.style.backgroundImage = 'url("https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=400")';
    preview.querySelector('.bg-preview-label').textContent = 'Default background';
  } else if (type === 'dark') {
    preview.style.backgroundImage = 'none';
    preview.style.background = '#0a0c14';
    preview.querySelector('.bg-preview-label').textContent = 'Dark solid';
  } else if (type === 'url' && url) {
    preview.style.backgroundImage = `url('${url}')`;
    preview.querySelector('.bg-preview-label').textContent = '';
  } else if (type === 'upload' && filePath) {
    preview.querySelector('.bg-preview-label').textContent = 'Custom image selected';
  }
}

// File upload for background
document.getElementById('bg-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showToast('Uploading background…');
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    const result = await window.electronAPI?.bgSaveFile(file.name, base64);
    if (result?.success) {
      settings._pendingBgPath = result.path;
      showToast('Background image ready — click Save Settings');
      document.getElementById('bg-preview').querySelector('.bg-preview-label').textContent = file.name;
    } else {
      showToast('Upload failed: ' + (result?.error || 'unknown'));
    }
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const hpSel   = document.getElementById('set-homepage').value;
  const homepage = hpSel === 'custom'
    ? document.getElementById('set-homepage-custom').value.trim()
    : hpSel;

  const ua      = document.getElementById('set-ua').value.trim();
  const searchSel = document.getElementById('set-search').value;
  const searchEngine = searchSel === 'custom'
    ? document.getElementById('set-search-custom').value.trim()
    : searchSel;

  const activeBgBtn = document.querySelector('.bg-option.active');
  const bgType = activeBgBtn?.dataset.bg || 'default';
  const bgUrl  = bgType === 'url' ? (document.getElementById('set-bg-url').value.trim()) : '';
  const bgPath = bgType === 'upload' ? (settings._pendingBgPath || settings.backgroundPath || '') : '';

  const newSettings = { homepage, userAgent: ua, searchEngine, backgroundType: bgType, backgroundUrl: bgUrl, backgroundPath: bgPath };
  window.electronAPI?.settingsSet(newSettings);
  window.electronAPI?.setUserAgent(ua);
  settings = { ...settings, ...newSettings };

  await applyBackground(bgType, bgUrl, bgPath);

  const toast = document.getElementById('settings-toast');
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
});

document.getElementById('btn-clear-cache').addEventListener('click', async () => {
  await window.electronAPI?.clearCache();
  showToast('Cache and cookies cleared!');
});

// Speed dials from settings
document.getElementById('btn-manage-dials')?.addEventListener('click', () => {
  closePanel();
  // Open the first new tab to show dials, or just open modal
  showToast('Edit dials by clicking the ✎ icon on any speed dial on the new tab page');
  const activeTab = getTab(activeTabId);
  if (!activeTab?.ntpEl) createTab();
});

// ══════════════════════════════════════
// DOWNLOADS
// ══════════════════════════════════════
const downloadsList = document.getElementById('downloads-list');
const downloads     = new Map();

function renderDownloads() {
  if (downloads.size === 0) {
    downloadsList.innerHTML = '<div class="panel-empty">No downloads yet</div>';
    return;
  }

  downloadsList.innerHTML = '';
  const sorted = Array.from(downloads.values()).sort((a, b) => b.id - a.id);

  sorted.forEach(dl => {
    const item = document.createElement('div');
    item.className = 'panel-item download-item';
    item.id = `dl-${dl.id}`;

    const pct  = dl.total > 0 ? Math.round((dl.received / dl.total) * 100) : 0;
    const done = dl.state === 'completed';
    const err  = dl.state === 'interrupted' || dl.state === 'cancelled';

    let statusMeta = '';
    if (!done && !err) {
      statusMeta = `
        <div style="width:100%;margin-top:4px;">
          <div style="background:rgba(255,255,255,0.08);height:3px;border-radius:2px;overflow:hidden;">
            <div class="dl-bar-fill" style="width:${pct}%;height:100%;"></div>
          </div>
          <div style="font-size:11px;opacity:0.55;margin-top:2px;">${pct}% — ${formatBytes(dl.received)} / ${formatBytes(dl.total)}</div>
        </div>`;
    } else if (done) {
      statusMeta = `<div class="panel-item-url" style="color:var(--success);">✓ Complete · ${formatBytes(dl.total)}</div>`;
    } else {
      statusMeta = `<div class="panel-item-url" style="color:var(--danger);">✕ ${dl.state}</div>`;
    }

    item.innerHTML = `
      <div class="panel-favicon" style="font-size:18px;">📥</div>
      <div class="panel-item-info">
        <div class="panel-item-title" title="${escapeHtml(dl.filename)}">${escapeHtml(dl.filename)}</div>
        ${statusMeta}
        ${done ? `
          <div style="margin-top:6px;display:flex;gap:8px;">
            <button class="glass-btn dl-open" data-path="${escapeHtml(dl.savePath||'')}" style="padding:3px 10px;font-size:11px;">Open</button>
            <button class="glass-btn dl-show" data-path="${escapeHtml(dl.savePath||'')}" style="padding:3px 10px;font-size:11px;">Show in Folder</button>
          </div>` : ''}
      </div>
    `;

    item.querySelector('.dl-open')?.addEventListener('click', e => { e.stopPropagation(); window.electronAPI?.openFile(dl.savePath); });
    item.querySelector('.dl-show')?.addEventListener('click', e => { e.stopPropagation(); window.electronAPI?.showFile(dl.savePath); });
    downloadsList.appendChild(item);
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

window.electronAPI?.onDownloadStarted(dl => {
  downloads.set(dl.id, dl);
  openPanel('downloads');
});
window.electronAPI?.onDownloadUpdated(dl => {
  const existing = downloads.get(dl.id) || {};
  downloads.set(dl.id, { ...existing, ...dl });
  if (activePanel === 'downloads') renderDownloads();
});
window.electronAPI?.onDownloadDone(dl => {
  const existing = downloads.get(dl.id) || {};
  downloads.set(dl.id, { ...existing, ...dl });
  if (activePanel === 'downloads') renderDownloads();
});

// ══════════════════════════════════════
// OPEN URL FROM MAIN PROCESS
// ══════════════════════════════════════
window.electronAPI?.onOpenUrl(url => createTab(url));

// Context menu events forwarded from webview (inside page right-click)
window.electronAPI?.onWebviewContextMenu(params => {
  const tab = getTab(activeTabId);
  const items = [];

  if (params.selectionText) {
    items.push(
      { label: 'Copy',        icon: svgCopy(),    action: () => navigator.clipboard.writeText(params.selectionText) },
      { label: 'Search',      icon: svgSearch(),  action: () => createTab(settings.searchEngine + encodeURIComponent(params.selectionText)) },
      'sep'
    );
  }
  if (params.linkURL) {
    items.push(
      { label: 'Open in New Tab', icon: svgNewTab(),  action: () => createTab(params.linkURL) },
      { label: 'Copy Link',       icon: svgCopy(),    action: () => navigator.clipboard.writeText(params.linkURL) },
      'sep'
    );
  }

  items.push(
    { label: 'Back',    icon: svgBack(),    action: () => btnBack.click() },
    { label: 'Forward', icon: svgForward(), action: () => btnForward.click() },
    { label: 'Reload',  icon: svgReload(),  action: () => btnReload.click() },
    'sep',
    { label: 'DevTools', icon: svgDevtools(), action: () => document.getElementById('btn-devtools').click() }
  );

  showCtxMenu(params.x, params.y, items);
});

// ══════════════════════════════════════
// URL AUTOCOMPLETE
// ══════════════════════════════════════
urlInput.addEventListener('input', async (e) => {
  const query = urlInput.value.toLowerCase().trim();
  if (!query) { suggestionsBox.classList.remove('visible'); return; }

  const historyItems = await window.electronAPI?.historyGet() || [];
  const counts = {};
  historyItems.forEach(h => { if (h.url) counts[h.url] = (counts[h.url] || 0) + 1; });

  const matches = historyItems
    .filter(h => h.url?.toLowerCase().includes(query) || h.title?.toLowerCase().includes(query))
    .sort((a, b) => (counts[b.url] || 0) - (counts[a.url] || 0));

  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    if (!seen.has(m.url)) { seen.add(m.url); unique.push(m); }
    if (unique.length >= 6) break;
  }

  if (!unique.length) { suggestionsBox.classList.remove('visible'); return; }

  suggestionsBox.innerHTML = unique.map(match => {
    const domain = (() => { try { return new URL(match.url).hostname; } catch { return ''; } })();
    const faviconSrc = match.favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '');
    return `
    <div class="suggestion-item">
      <img class="suggestion-favicon" src="${faviconSrc}" alt="" onerror="this.style.opacity='0'" />
      <div class="suggestion-info">
        <span class="suggestion-title">${escapeHtml(match.title || domain || 'Visited Site')}</span>
        <span class="suggestion-url">${escapeHtml(match.url)}</span>
      </div>
    </div>`;
  }).join('');

  suggestionsBox.querySelectorAll('.suggestion-item').forEach((item, i) => {
    item.addEventListener('click', () => {
      urlInput.value = unique[i].url;
      navigate(unique[i].url);
      suggestionsBox.classList.remove('visible');
    });
  });

  suggestionsBox.classList.add('visible');
});

document.addEventListener('click', e => {
  if (!e.target.closest('#url-bar-wrap') && !e.target.closest('#url-suggestions')) {
    suggestionsBox.classList.remove('visible');
  }
});

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
let toastTimer = null;
function showToast(msg) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'global-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

// ══════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key === 't') { e.preventDefault(); createTab(); }
  if (mod && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
  if (mod && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
  if (mod && e.key === 'r') { e.preventDefault(); btnReload.click(); }
  if (mod && e.key === 'h') { e.preventDefault(); openPanel('history'); }
  if (mod && e.key === 'b') { e.preventDefault(); openPanel('bookmarks'); }
  if (mod && e.key === ',') { e.preventDefault(); openPanel('settings'); }
  if (mod && e.key === 'o') {
    e.preventDefault();
    window.electronAPI?.openFileDialog().then(urls => (urls || []).forEach(u => createTab(u)));
  }
  if (e.key === 'Escape')   { closePanel(); suggestionsBox.classList.remove('visible'); }

  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); btnBack.click(); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); btnForward.click(); }

  if (mod && e.key >= '1' && e.key <= '9') {
    const idx = +e.key - 1;
    if (tabs[idx]) setActiveTab(tabs[idx].id);
  }

  if (mod && e.key === 'Tab') {
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === activeTabId);
    const next = e.shiftKey
      ? (idx - 1 + tabs.length) % tabs.length
      : (idx + 1) % tabs.length;
    if (tabs[next]) setActiveTab(tabs[next].id);
  }
});


// ══════════════════════════════════════
// CUSTOM CONTEXT MENU
// ══════════════════════════════════════
let ctxMenu = null;
let ctxOverlay = null;

function closeCtxMenu() {
  if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
  if (ctxOverlay) { ctxOverlay.remove(); ctxOverlay = null; }
}

function buildCtxItem(label, icon, action, danger = false) {
  const el = document.createElement('div');
  el.className = 'ctx-item' + (danger ? ' danger' : '');
  el.innerHTML = `${icon}<span>${label}</span>`;
  el.addEventListener('click', () => { closeCtxMenu(); action(); });
  return el;
}

function buildCtxSep() {
  const el = document.createElement('div');
  el.className = 'ctx-sep';
  return el;
}

function showCtxMenu(x, y, items) {
  closeCtxMenu();

  // 1. Maak een onzichtbare overlay aan die de hele browser bedekt
  ctxOverlay = document.createElement('div');
  ctxOverlay.style.position = 'fixed';
  ctxOverlay.style.top = '0';
  ctxOverlay.style.left = '0';
  ctxOverlay.style.width = '100vw';
  ctxOverlay.style.height = '100vh';
  ctxOverlay.style.zIndex = '999998'; // Net onder het context menu
  ctxOverlay.style.background = 'transparent'; // Onzichtbaar
  document.body.appendChild(ctxOverlay);

  // Als je op de onzichtbare laag klikt (dus buiten het menu of op de site), sluit het menu
  ctxOverlay.addEventListener('mousedown', () => {
    closeCtxMenu();
  });

  // 2. Maak het eigenlijke context menu aan
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.zIndex = '999999'; // Zorg dat deze áltijd bovenop ligt
  
  items.forEach(item => {
    if (item === 'sep') ctxMenu.appendChild(buildCtxSep());
    else ctxMenu.appendChild(buildCtxItem(item.label, item.icon, item.action, item.danger));
  });

  document.body.appendChild(ctxMenu);

  // Positionering (ongewijzigd)
  requestAnimationFrame(() => {
    if (!ctxMenu) return;
    const rect = ctxMenu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x, top = y;
    if (left + rect.width  > vw) left = vw - rect.width  - 6;
    if (top  + rect.height > vh) top  = vh - rect.height - 6;
    if (left < 6) left = 6;
    if (top  < 6) top  = 6;
    ctxMenu.style.left = left + 'px';
    ctxMenu.style.top  = top  + 'px';
  });
}

document.addEventListener('contextmenu', e => {
  // Don't intercept context menu inside webviews (they handle their own)
  if (e.target.closest('webview')) return;
  e.preventDefault();

  const tab = getTab(activeTabId);
  const hasPage = !!tab?.webview;
  const hasUrl  = !!(tab?.url);

  const items = [];

  // URL bar context — text selection
  if (e.target === urlInput || e.target.closest('#url-bar-wrap')) {
    items.push(
      { label: 'Cut',   icon: svgCut(),   action: () => document.execCommand('cut') },
      { label: 'Copy',  icon: svgCopy(),  action: () => document.execCommand('copy') },
      { label: 'Paste', icon: svgPaste(), action: () => {
          navigator.clipboard.readText().then(t => { urlInput.value = t; }).catch(() => document.execCommand('paste'));
        }
      },
      'sep',
      { label: 'Select All', icon: svgSelectAll(), action: () => { urlInput.focus(); urlInput.select(); } }
    );
  } else {
    // General browser context menu
    if (hasPage) {
      items.push(
        { label: 'Back',    icon: svgBack(),    action: () => btnBack.click() },
        { label: 'Forward', icon: svgForward(), action: () => btnForward.click() },
        { label: 'Reload',  icon: svgReload(),  action: () => btnReload.click() },
        'sep'
      );
    }
    if (hasUrl) {
      items.push(
        { label: 'New Tab',       icon: svgNewTab(),    action: () => createTab() },
        { label: 'Duplicate Tab', icon: svgDuplicate(), action: () => createTab(tab.url) },
        'sep',
        { label: 'Bookmark Page', icon: svgBookmark(),  action: () => {
            if (!tab?.url) return;
            window.electronAPI?.bookmarkAdd({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon || '' });
            showToast('Bookmark saved!');
          }
        },
        'sep'
      );
    }
    items.push(
      { label: 'Open DevTools', icon: svgDevtools(), action: () => document.getElementById('btn-devtools').click() },
      'sep',
      { label: 'History',  icon: svgHistory(),  action: () => openPanel('history') },
      { label: 'Settings', icon: svgSettings(), action: () => openPanel('settings') }
    );
    if (tabs.length > 1) {
      items.push('sep', { label: 'Close Tab', icon: svgClose(), action: () => closeTab(activeTabId), danger: true });
    }
  }

  showCtxMenu(e.clientX, e.clientY, items);
});

// 1. Sluit het menu als er binnen de browser-schil wordt geklikt
document.addEventListener('click', e => {
  if (ctxMenu) {
    if (ctxMenu.contains(e.target) && !e.target.closest('.ctx-item')) {
      return; // Lege ruimte in menu -> open blijven
    }
    closeCtxMenu();
  }
});

// 2. Sluit het menu als de Escape-toets wordt ingedrukt
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtxMenu(); });

// 3. DE FIX VOOR SITES (YOUTUBE): 
// Zodra je in een website klikt, verliest het hoofdvenster/schil de focus.
window.addEventListener('blur', () => {
  closeCtxMenu();
});

// 4. Als extra vangnet: luister naar wanneer een webview actief wordt (geklikt wordt)
document.querySelectorAll('webview').forEach(webview => {
  webview.addEventListener('blur', () => closeCtxMenu());
  webview.addEventListener('focus', () => closeCtxMenu());
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtxMenu(); });

// ══════════════════════════════════════
// WEBVIEW CLICK INTERCEPTION (ZONDER PRELOAD.JS)
// ══════════════════════════════════════
// Zorg dat je deze functie aanroept zodra je een nieuwe <webview> aanmaakt/koppelt
function hookWebviewClick(webviewEl) {
  webviewEl.addEventListener('dom-ready', () => {
    // Injecteer een click listener direct in de geladen website (zoals YouTube)
    webviewEl.executeJavaScript(`
      document.addEventListener('click', () => {
        console.log('__webview_click_detected__');
      });
    `);
  });

  // Luister naar de console logs van de webview
  webviewEl.addEventListener('console-message', (e) => {
    if (e.message === '__webview_click_detected__') {
      closeCtxMenu();
    }
  });
}

// Luister naar de kliks die vanuit het Main Process (main.js) worden doorgestuurd
if (window.electronAPI && window.electronAPI.ipcRenderer) {
  window.electronAPI.ipcRenderer.on('global-click-detected', () => {
    closeCtxMenu();
  });
} else {
  // Als je ipcRenderer direct in je schil mag gebruiken (zonder contextBridge):
  try {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('global-click-detected', () => {
      closeCtxMenu();
    });
  } catch (e) {
    // Mocht dit ook falen, zorg dan dat 'global-click-detected' via je bestaande preload/electronAPI loopt
    console.error("Kon ipcRenderer niet laden. Zorg dat global-click-detected via electronAPI wordt doorgegeven.");
  }
}

// SVG icon helpers voor context menu
function svgIcon(path) { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }
function svgBack()      { return svgIcon('<path d="M19 12H5M12 5l-7 7 7 7"/>'); }
function svgForward()   { return svgIcon('<path d="M5 12h14M12 5l7 7-7 7"/>'); }
function svgReload()    { return svgIcon('<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.02"/>'); }
function svgNewTab()    { return svgIcon('<path d="M12 5v14M5 12h14"/>'); }
function svgDuplicate() { return svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'); }
function svgBookmark()  { return svgIcon('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'); }
function svgDevtools()  { return svgIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'); }
function svgHistory()   { return svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'); }
function svgSettings()  { return svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'); }
function svgClose()     { return svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'); }
function svgCut()       { return svgIcon('<circle cx="6" cy="20" r="2"/><circle cx="6" cy="4" r="2"/><line x1="6" y1="6" x2="6" y2="18"/><line x1="21" y1="4" x2="6" y2="12"/>'); }
function svgCopy()      { return svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'); }
function svgPaste()     { return svgIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>'); }
function svgSelectAll() { return svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/>'); }
function svgSearch()    { return svgIcon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'); }

// ══════════════════════════════════════
// FIRST-RUN ONBOARDING
// ══════════════════════════════════════
const onboardingSteps = Array.from(document.querySelectorAll('.onboarding-step'));
const onboardingProgress = document.getElementById('onboarding-progress');
let obStepIndex = 0;
let obChoices = { searchEngine: 'https://www.google.com/search?q=', titleBarStyle: 'mac' };

function buildOnboardingProgress() {
  onboardingProgress.innerHTML = onboardingSteps.map((_, i) => `<span data-i="${i}"></span>`).join('');
}

function showOnboardingStep(idx) {
  obStepIndex = idx;
  onboardingSteps.forEach(el => { el.style.display = (+el.dataset.step === idx) ? '' : 'none'; });
  onboardingProgress.querySelectorAll('span').forEach(s => s.classList.toggle('active', +s.dataset.i === idx));

  const backBtn = document.getElementById('ob-back-btn');
  const nextBtn = document.getElementById('ob-next-btn');
  backBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
  nextBtn.textContent = idx === onboardingSteps.length - 1 ? 'Finish' : 'Next';
}

document.getElementById('ob-search-options')?.querySelectorAll('.onboarding-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('ob-search-options').querySelectorAll('.onboarding-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    obChoices.searchEngine = btn.dataset.value;
  });
});

document.getElementById('ob-titlebar-options')?.querySelectorAll('.onboarding-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('ob-titlebar-options').querySelectorAll('.onboarding-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    obChoices.titleBarStyle = btn.dataset.value;
    applyTitleBarStyle(btn.dataset.value);
  });
});

document.getElementById('ob-set-default-btn')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('ob-default-status');
  const result = await window.electronAPI?.setDefaultBrowser();
  if (result?.requiresManualConfirm) statusEl.textContent = 'Finish setup in the Windows Settings window that just opened.';
  else if (result?.success) statusEl.textContent = '✓ GlassyWeb is now your default browser';
  else statusEl.textContent = 'Could not set as default browser.';
});

document.getElementById('ob-back-btn')?.addEventListener('click', () => {
  if (obStepIndex > 0) showOnboardingStep(obStepIndex - 1);
});

document.getElementById('ob-next-btn')?.addEventListener('click', () => {
  if (obStepIndex < onboardingSteps.length - 1) {
    showOnboardingStep(obStepIndex + 1);
  } else {
    finishOnboarding();
  }
});

async function finishOnboarding() {
  settings.searchEngine  = obChoices.searchEngine;
  settings.titleBarStyle = obChoices.titleBarStyle;
  window.electronAPI?.settingsSet({ searchEngine: obChoices.searchEngine, titleBarStyle: obChoices.titleBarStyle });
  window.electronAPI?.onboardingComplete();

  // First run: don't show "What's New" for the version they just installed with
  const version = await window.electronAPI?.getAppVersion();
  if (version) window.electronAPI?.setLastSeenVersion(version);

  document.getElementById('onboarding-overlay').classList.remove('visible');
}

async function maybeShowOnboarding() {
  buildOnboardingProgress();
  const onboarded = await window.electronAPI?.onboardingGet();
  if (onboarded) return false;
  showOnboardingStep(0);
  document.getElementById('onboarding-overlay').classList.add('visible');
  return true;
}

// ══════════════════════════════════════
// WHAT'S NEW
// ══════════════════════════════════════
async function showWhatsNew(manualOpen = false) {
  const version = await window.electronAPI?.getAppVersion();
  document.getElementById('whatsnew-version').textContent = version ? `v${version}` : '';
  document.getElementById('whatsnew-overlay').classList.add('visible');
  if (!manualOpen && version) window.electronAPI?.setLastSeenVersion(version);
}

function closeWhatsNew() {
  document.getElementById('whatsnew-overlay').classList.remove('visible');
}
document.getElementById('whatsnew-close')?.addEventListener('click', closeWhatsNew);
document.getElementById('whatsnew-got-it')?.addEventListener('click', closeWhatsNew);

async function maybeShowWhatsNew() {
  const [current, lastSeen] = await Promise.all([
    window.electronAPI?.getAppVersion(),
    window.electronAPI?.getLastSeenVersion(),
  ]);
  if (current && lastSeen && current !== lastSeen) {
    showWhatsNew(false);
  } else if (current && !lastSeen) {
    // No record yet (e.g. upgraded from a build before this feature existed) — just record it, no popup.
    window.electronAPI?.setLastSeenVersion(current);
  }
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
async function init() {
  // Load settings
  try {
    const s = await window.electronAPI?.settingsGet();
    if (s) settings = { ...settings, ...s };
  } catch(e) { console.warn('Settings load error:', e); }

  // Load speed dials from disk
  await loadSpeedDials();

  // Apply background
  await applyBackground(settings.backgroundType || 'default', settings.backgroundUrl, settings.backgroundPath);

  // Apply window controls style
  applyTitleBarStyle(settings.titleBarStyle || 'mac');

  // Set user agent if saved
  if (settings.userAgent) {
    window.electronAPI?.setUserAgent(settings.userAgent);
  }

  // Open new tab page (homepage)
  createTab();

  // Tell the main process we can now receive queued "open this file" requests
  window.electronAPI?.rendererReady();

  // First-run onboarding takes priority; only check for a changelog once it's done (or skipped)
  const showedOnboarding = await maybeShowOnboarding();
  if (!showedOnboarding) {
    maybeShowWhatsNew();
  }

  console.log('[GlassyWeb v2.0] Initialized ✓');
}

init();
