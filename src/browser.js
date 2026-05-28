/* ═══════════════════════════════════════
   Glassy Browser — Renderer Logic
   ═══════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
let tabs        = [];
let activeTabId = null;
let tabCounter  = 0;
let settings    = {
  homepage: 'https://google.com',
  searchEngine: 'https://www.google.com/search?q=',
  userAgent: '',
};

// ══════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════
const tabsContainer = document.getElementById('tabs-container');
const contentArea   = document.getElementById('content-area');
const urlInput      = document.getElementById('url-input');
const urlLock       = document.getElementById('url-lock');
const btnBack       = document.getElementById('btn-back');
const btnForward    = document.getElementById('btn-forward');
const btnReload     = document.getElementById('btn-reload');
const btnHome       = document.getElementById('btn-home');
const newTabBtn     = document.getElementById('new-tab-btn');
const loadingBar    = document.getElementById('loading-bar');
const panelOverlay  = document.getElementById('panel-overlay');
const suggestionsBox = document.getElementById('url-suggestions');


// ══════════════════════════════════════
// LOADING BAR
// ══════════════════════════════════════
let loadingTimer = null;

function startLoading() {
  loadingBar.classList.add('loading');
  loadingBar.style.width = '70%';
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
// SPEED DIALS
// ══════════════════════════════════════
const speedDials = [
  { label: 'YouTube',   url: 'https://youtube.com',        favicon: 'https://cdn.brandfetch.io/idVfYwcuQz/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Gemini',    url: 'https://gemini.google.com',  favicon: 'https://cdn.brandfetch.io/id6O2oGzv-/theme/dark/idYgLxDNTi.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Discord',   url: 'https://discord.com/app',    favicon: 'https://cdn.brandfetch.io/idM8Hlme1a/theme/dark/symbol.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Canva',     url: 'https://canva.com',          favicon: 'https://cdn.brandfetch.io/id9mVQlyB1/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B' },
  { label: 'Spotify',   url: 'https://open.spotify.com',   favicon: 'https://cdn.brandfetch.io/id20mQyGeY/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1737597212873' },
  { label: 'Netflix',   url: 'https://netflix.com',        favicon: 'https://cdn.brandfetch.io/ideQwN5lBE/w/496/h/901/theme/dark/symbol.png?c=1bxid64Mup7aczewSAYMX&t=1741362568700'
  },
];

// ══════════════════════════════════════
// NEW TAB PAGE
// ══════════════════════════════════════
function buildNewTabPage() {
  const page = document.createElement('div');
  page.className = 'new-tab-page';

  page.innerHTML = `
    <div class="ntp-logo">GlassyWeb</div>
    <div class="ntp-search">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8"/>
        <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      <input type="text" id="ntp-search-input" placeholder="Search or type a URL…" autocomplete="off" />
    </div>
    <div class="speed-dials">
      ${speedDials.map((d, i) => `
        <div class="speed-dial" data-idx="${i}">
          <div class="speed-dial-icon">
            <img src="${d.favicon}" alt="${d.label[0]}" onerror="this.style.display='none'" />
          </div>
          <span>${d.label}</span>
        </div>
      `).join('')}
    </div>
  `;

  page.querySelectorAll('.speed-dial[data-idx]').forEach(el => {
    el.addEventListener('click', () => navigate(speedDials[+el.dataset.idx].url));
  });

  const ntpInput = page.querySelector('#ntp-search-input');
  if (ntpInput) {
    ntpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = ntpInput.value.trim();
        if (q) navigate(resolveUrl(q));
      }
    });
    // Auto-focus NTP search when tab is active
    setTimeout(() => ntpInput.focus(), 50);
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
  ERR_CONNECTION_REFUSED:  { title: 'Connection Refused',     icon: '🔌', msg: 'The server actively refused the connection. It may be offline.' },
  ERR_NAME_NOT_RESOLVED:   { title: 'Server Not Found',       icon: '🌐', msg: "The DNS lookup failed. Check the URL or your internet connection." },
  ERR_INTERNET_DISCONNECTED:{ title:'No Internet Connection', icon: '📡', msg: 'You appear to be offline. Check your network connection.' },
  ERR_TIMED_OUT:           { title: 'Connection Timed Out',   icon: '⏱️', msg: 'The server took too long to respond.' },
  ERR_CERT_AUTHORITY_INVALID:{ title:'Certificate Error',     icon: '🔐', msg: 'The site\'s security certificate is not trusted.' },
  ERR_ABORTED:             { title: 'Aborted',                icon: '❌', msg: 'The navigation was cancelled.' },
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

  page.querySelector('#err-retry').addEventListener('click', () => {
    if (url) navigate(url);
  });
  page.querySelector('#err-home').addEventListener('click', () => {
    navigate(settings.homepage || 'https://google.com');
  });
  page.querySelector('#err-back').addEventListener('click', () => {
    btnBack.click();
  });

  return page;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    <img class="tab-favicon" src="" alt="" style="display:none" />
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
  return id;
}

function createWebview(url, tabId) {
  const wv = document.createElement('webview');
  wv.setAttribute('src', sanitizeUrl(url));
  wv.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=no');
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
  
  // Voeg de closing class toe om de CSS-animatie te starten
  tab.tabEl.classList.add('closing');

  // Wacht precies 300ms (de duur van de animatie) en verwijder dan de elementen
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
  }, 300);
}

function getTab(id) { return tabs.find(t => t.id === id); }

// ══════════════════════════════════════
// WEBVIEW EVENTS
// ══════════════════════════════════════
function attachWebviewEvents(wv, tabId) {
  wv.addEventListener('did-start-loading', () => {
    if (tabId === activeTabId) startLoading();
    updateTabTitle(tabId, 'Loading…');
    updateReloadBtn(true);
  });

  wv.addEventListener('did-stop-loading', () => {
    if (tabId === activeTabId) stopLoading();
    updateReloadBtn(false);
    
    // Vraag de echte titel op van de webview
    setTimeout(() => {
      try {
        const title = wv.getTitle();
        const currentUrl = wv.getURL();
        if (title && title !== 'about:blank') {
          updateTabTitle(tabId, title);
        } else if (currentUrl) {
          updateTabTitle(tabId, currentUrl.replace(/^https?:\/\/(www\.)?/, ''));
        }
      } catch (err) {
        updateTabTitle(tabId, 'New Tab');
      }
    }, 100);
  });

  wv.addEventListener('did-navigate', ({ url, httpResponseCode }) => {
    updateTabUrl(tabId, url);
    // Handle HTTP error codes
    if (httpResponseCode && httpResponseCode >= 400) {
      showErrorPage(tabId, httpResponseCode, url, null);
    } else {
      removeErrorPage(tabId);
    }
    // Add to history
    const tab = getTab(tabId);
    const title = tab?.title || '';
    if (url && !url.startsWith('about:')) {
      window.electronAPI?.historyAdd({ url, title, favicon: tab?.favicon || '' });
    }
  });

  wv.addEventListener('did-navigate-in-page', ({ url }) => {
    updateTabUrl(tabId, url);
  });

  wv.addEventListener('did-fail-load', ({ errorCode, errorDescription, validatedURL, isMainFrame }) => {
    if (!isMainFrame) return;
    // Ignore intentional aborts (user stopped navigation)
    if (errorCode === -3) return; // ERR_ABORTED from navigation, normal
    const errKey = errorDescription || String(errorCode);
    showErrorPage(tabId, errKey, validatedURL, errorDescription);
  });

  wv.addEventListener('new-window', ({ url }) => {
    createTab(url);
  });

  // Forward context menu / right-click for devtools
  wv.addEventListener('context-menu', (e) => {
    e.preventDefault();
  });
}

function showErrorPage(tabId, code, url, desc) {
  const tab = getTab(tabId);
  if (!tab) return;

  // Remove old error page
  if (tab.errorEl) { tab.errorEl.remove(); tab.errorEl = null; }

  // Hide webview
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
  t.tabEl.querySelector('.tab-title').textContent = title;
  if (id === activeTabId) document.title = `${title} — GlassyWeb`;
}

function updateTabFavicon(id, faviconUrl) {
  const t = getTab(id);
  if (!t) return;
  t.favicon = faviconUrl;
  const img = t.tabEl.querySelector('.tab-favicon');
  if (img) {
    img.src = faviconUrl;
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; };
  }
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
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 15a9 9 0 1 0 .49-4.02" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btnReload.title = isLoading ? 'Stop (Ctrl+R)' : 'Reload (Ctrl+R)';
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function navigate(url) {
  const tab = getTab(activeTabId);
  if (!tab) return;

  const safeUrl = sanitizeUrl(url);

  // Remove error page if present
  removeErrorPage(activeTabId);

  if (tab.ntpEl) {
    tab.ntpEl.remove();
    tab.ntpEl = null;
    tab.webview = createWebview(safeUrl, tab.id);
    tab.webview.classList.add('active');
  } else if (tab.webview) {
    tab.webview.setAttribute('src', safeUrl);
    tab.webview.style.display = '';
  }

  tab.url = safeUrl;
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

btnHome.addEventListener('click', () => {
  navigate(settings.homepage || 'https://google.com');
});

// ══════════════════════════════════════
// URL BAR
// ══════════════════════════════════════
urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    navigate(resolveUrl(urlInput.value.trim()));
    urlInput.blur();
  }
  if (e.key === 'Escape') urlInput.blur();
});
// URL INPUT KEYDOWN (Enter / Pijltjestoetsen)
urlInput.addEventListener('keydown', e => {
  const items = suggestionsBox.querySelectorAll('.suggestion-item');
  let selectedIndex = Array.from(items).findIndex(item => item.classList.contains('selected'));

  if (!suggestionsBox.classList.contains('visible') || items.length === 0) {
    if (e.key === 'Enter') {
      navigate(resolveUrl(urlInput.value.trim()));
      urlInput.blur();
    }
    if (e.key === 'Escape') urlInput.blur();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[selectedIndex]?.classList.remove('selected');
    selectedIndex = (selectedIndex + 1) % items.length;
    items[selectedIndex].classList.add('selected');
    urlInput.value = items[selectedIndex].querySelector('.suggestion-url').textContent;
  } 
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[selectedIndex]?.classList.remove('selected');
    selectedIndex = (selectedIndex - 1 + items.length) % items.length;
    items[selectedIndex].classList.add('selected');
    urlInput.value = items[selectedIndex].querySelector('.suggestion-url').textContent;
  } 
  else if (e.key === 'Enter') {
    e.preventDefault();
    const activeItem = items[selectedIndex];
    if (activeItem) {
      const targetUrl = activeItem.querySelector('.suggestion-url').textContent;
      urlInput.value = targetUrl;
      navigate(targetUrl);
    } else {
      navigate(resolveUrl(urlInput.value.trim()));
    }
    suggestionsBox.classList.remove('visible');
    urlInput.blur();
  }
  else if (e.key === 'Escape') {
    suggestionsBox.classList.remove('visible');
    urlInput.blur();
  }
});
urlInput.addEventListener('focus', () => urlInput.select());

document.getElementById('url-go-btn').addEventListener('click', () => {
  navigate(resolveUrl(urlInput.value.trim()));
});

// Bookmark current page from URL bar button
document.getElementById('btn-bookmark-cur').addEventListener('click', () => {
  const tab = getTab(activeTabId);
  if (!tab || !tab.url) return;
  const bm = { url: tab.url, title: tab.title || tab.url, favicon: tab.favicon || '' };
  window.electronAPI?.bookmarkAdd(bm);
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

// Sidebar icons
document.querySelectorAll('.sidebar-icon[data-url]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.url));
});

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

// DevTools button — split-screen toggle
document.getElementById('btn-devtools').addEventListener('click', () => {
  const tab = getTab(activeTabId);
  if (!tab?.webview) return;
  try {
    const wcId = tab.webview.getWebContentsId?.();
    if (wcId) window.electronAPI?.toggleDevToolsSplit(wcId);
  } catch(e) { console.warn('DevTools error:', e); }
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

  // Group by date
  const groups = {};
  filtered.forEach(h => {
    const d = new Date(h.timestamp);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
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
          <button class="panel-item-del" data-url="${escapeHtml(h.url || '')}" title="Remove">✕</button>
        </div>
      `).join('')}
    </div>
  `).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('panel-item-del')) return;
      navigate(el.dataset.url);
      closePanel();
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

document.getElementById('history-search').addEventListener('input', e => {
  renderHistory(e.target.value.toLowerCase());
});

document.getElementById('btn-history-clear').addEventListener('click', () => {
  if (!confirm('Clear all browsing history?')) return;
  window.electronAPI?.historyClear();
  renderHistory();
});

document.getElementById('btn-clear-hist-s').addEventListener('click', () => {
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
      <button class="panel-item-del" data-url="${escapeHtml(b.url || '')}" title="Remove bookmark">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.panel-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('panel-item-del')) return;
      navigate(el.dataset.url);
      closePanel();
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

document.getElementById('bookmarks-search').addEventListener('input', e => {
  renderBookmarks(e.target.value.toLowerCase());
});

// ══════════════════════════════════════
// EXTENSIONS
// ══════════════════════════════════════
async function renderExtensions() {
  const list = document.getElementById('extensions-list');

  list.innerHTML = '<div class="panel-empty" style="opacity:0.6;">Loading extensions…</div>';

  let exts = [];
  try { exts = await window.electronAPI?.extensionsList() || []; }
  catch(e) { console.warn('extensions-list error', e); }

  if (!exts.length) {
    list.innerHTML = `
      <div class="panel-empty" style="text-align:left;padding:12px 0;">
        <p style="margin-bottom:8px;">No extensions installed yet.</p>
        <p style="font-size:12px;opacity:0.65;line-height:1.5;">
          To install an extension, drop its <strong>unpacked folder</strong> into
          your Extensions directory and restart the browser.<br><br>
          You can browse the Chrome Web Store below — use the <em>CRX Extractor</em>
          browser extension on a real Chrome session to download a .crx, then unzip
          it into the extensions folder.
        </p>
      </div>`;
    return;
  }

  list.innerHTML = exts.map(ext => `
    <div class="panel-item ext-item">
      <div class="ext-icon">🧩</div>
      <div class="panel-item-info">
        <div class="panel-item-title">${escapeHtml(ext.name)} <span class="ext-ver" style="opacity:0.55;font-size:11px;">v${escapeHtml(ext.version)}</span></div>
        <div class="panel-item-url">${escapeHtml(ext.description || '')}</div>
      </div>
    </div>
  `).join('');
}

document.getElementById('btn-open-ext-dir').addEventListener('click', () => {
  window.electronAPI?.extensionsOpenDir();
});

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

  document.getElementById('set-homepage').value = s.homepage || '';
  document.getElementById('set-ua').value       = s.userAgent || '';

  const searchSelect = document.getElementById('set-search');
  const knownEngines = Array.from(searchSelect.options).map(o => o.value).filter(v => v !== 'custom');
  if (knownEngines.includes(s.searchEngine)) {
    searchSelect.value = s.searchEngine;
  } else if (s.searchEngine) {
    searchSelect.value = 'custom';
    document.getElementById('set-search-custom').value = s.searchEngine;
    document.getElementById('custom-search-row').style.display = '';
  }

  const ua = await window.electronAPI?.getUserAgent() || 'Default';
  document.getElementById('current-ua').textContent = ua.length > 80 ? ua.slice(0, 80) + '…' : ua;
}

document.getElementById('set-search').addEventListener('change', function() {
  const row = document.getElementById('custom-search-row');
  row.style.display = this.value === 'custom' ? '' : 'none';
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const homepage  = document.getElementById('set-homepage').value.trim();
  const ua        = document.getElementById('set-ua').value.trim();
  const searchSel = document.getElementById('set-search').value;
  const searchEngine = searchSel === 'custom'
    ? document.getElementById('set-search-custom').value.trim()
    : searchSel;

  const newSettings = { homepage, userAgent: ua, searchEngine };
  window.electronAPI?.settingsSet(newSettings);
  window.electronAPI?.setUserAgent(ua);
  settings = { ...settings, ...newSettings };

  const toast = document.getElementById('settings-toast');
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2000);
});

document.getElementById('btn-clear-cache').addEventListener('click', async () => {
  await window.electronAPI?.clearCache();
  showToast('Cache and cookies cleared!');
});

// ══════════════════════════════════════
// DOWNLOADS PANEL (HISTORY STYLE)
// ══════════════════════════════════════
const downloadsList = document.getElementById('downloads-list');
const downloads     = new Map();

function renderDownloads() {
  if (downloads.size === 0) {
    downloadsList.innerHTML = '<div class="panel-empty">No downloads yet</div>';
    return;
  }

  downloadsList.innerHTML = '';
  // Sorteer downloads zodat de nieuwste bovenaan staat (net als history)
  const sortedDownloads = Array.from(downloads.values()).sort((a, b) => b.id - a.id);

  sortedDownloads.forEach(dl => {
    const item = document.createElement('div');
    item.className = 'panel-item download-item';
    item.id = `dl-${dl.id}`;

    const pct = dl.total > 0 ? Math.round((dl.received / dl.total) * 100) : 0;
    const done = dl.state === 'completed';
    const err  = dl.state === 'interrupted' || dl.state === 'cancelled';

    let statusMeta = '';
    if (!done && !err) {
      statusMeta = `
        <div class="dl-progress-container" style="width: 100%; margin-top: 4px;">
          <div class="dl-bar" style="background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; overflow: hidden;">
            <div class="dl-bar-fill" style="width:${pct}%; background: var(--accent-color, #007acc); height: 100%;"></div>
          </div>
          <div class="dl-pct" style="font-size: 11px; opacity: 0.6; margin-top: 2px;">${pct}% downloaded</div>
        </div>`;
    } else if (done) {
      statusMeta = `<div class="panel-item-url" style="color: #4caf50;">✓ Complete</div>`;
    } else if (err) {
      statusMeta = `<div class="panel-item-url" style="color: #f44336;">✕ ${dl.state}</div>`;
    }

    item.innerHTML = `
      <div class="panel-favicon">📥</div>
      <div class="panel-item-info">
        <div class="panel-item-title" title="${escapeHtml(dl.filename)}">${escapeHtml(dl.filename)}</div>
        ${statusMeta}
        ${done ? `
          <div class="panel-item-actions" style="margin-top: 6px; display: flex; gap: 8px;">
            <button class="glass-btn dl-open" data-path="${escapeHtml(dl.savePath || '')}" style="padding: 2px 8px; font-size: 11px;">Open</button>
            <button class="glass-btn dl-show" data-path="${escapeHtml(dl.savePath || '')}" style="padding: 2px 8px; font-size: 11px;">Show</button>
          </div>` : ''}
      </div>
    `;

    item.querySelector('.dl-open')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI?.openFile(dl.savePath);
    });
    item.querySelector('.dl-show')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI?.showFile(dl.savePath);
    });

    downloadsList.appendChild(item);
  });
}

window.electronAPI?.onDownloadStarted(dl => {
  downloads.set(dl.id, dl);
  openPanel('downloads'); // Open het zijpaneel zodra een download start
});
window.electronAPI?.onDownloadUpdated(dl => {
  const existing = downloads.get(dl.id) || {};
  const merged = { ...existing, ...dl };
  downloads.set(dl.id, merged);
  if (activePanel === 'downloads') renderDownloads();
});
window.electronAPI?.onDownloadDone(dl => {
  const existing = downloads.get(dl.id) || {};
  const merged = { ...existing, ...dl };
  downloads.set(dl.id, merged);
  if (activePanel === 'downloads') renderDownloads();
});

// ══════════════════════════════════════
// OPEN URL FROM MAIN PROCESS
// ══════════════════════════════════════
window.electronAPI?.onOpenUrl(url => createTab(url));

// ══════════════════════════════════════
// AUTOCOMPLETE & DROPDOWN ENGINE
// ══════════════════════════════════════
urlInput.addEventListener('input', async (e) => {
  const query = urlInput.value.toLowerCase().trim();
  
  if (!query) {
    suggestionsBox.classList.remove('visible');
    return;
  }

  // Haal de geschiedenis op
  const historyItems = await window.electronAPI?.historyGet() || [];

  // Bereken frequentie van bezochte URL's
  const counts = {};
  historyItems.forEach(h => { if (h.url) counts[h.url] = (counts[h.url] || 0) + 1; });

  // Filter geschiedenis matches
  const matches = historyItems
    .filter(h => h.url?.toLowerCase().includes(query) || h.title?.toLowerCase().includes(query))
    .sort((a, b) => (counts[b.url] || 0) - (counts[a.url] || 0));

  // Filter unieke geschiedenis resultaten (maximaal 5)
  const uniqueMatches = [];
  const seenUrls = new Set();
  for (const match of matches) {
    if (!seenUrls.has(match.url)) {
      seenUrls.add(match.url);
      uniqueMatches.push(match);
    }
    if (uniqueMatches.length >= 5) break;
  }

  // INLINE AUTOCOMPLETE (voor echte URL's)
  if (e.inputType !== 'deleteContentBackward' && uniqueMatches.length > 0) {
    const bestMatch = uniqueMatches[0].url.replace(/^https?:\/\/(www\.)?/, '');
    const cleanQuery = query.replace(/^https?:\/\/(www\.)?/, '');

    if (bestMatch.startsWith(cleanQuery) && cleanQuery.length > 0) {
      const startPos = urlInput.value.length;
      const remainingText = bestMatch.substring(cleanQuery.length);
      
      urlInput.value += remainingText;
      urlInput.setSelectionRange(startPos, urlInput.value.length);
    }
  }

  // BOUW DROPDOWN LIJST
  suggestionsBox.innerHTML = '';

  // 2. VOEG DE GESCHIEDENIS MATCHES TOE
  uniqueMatches.forEach((match) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';

    item.innerHTML = `
      <div class="suggestion-icon">🌐</div>
      <div class="suggestion-info">
        <span class="suggestion-title">${escapeHtml(match.title || 'Known Site')}</span>
        <span class="suggestion-url">${escapeHtml(match.url)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      urlInput.value = match.url;
      navigate(match.url);
      suggestionsBox.classList.remove('visible');
    });

    suggestionsBox.appendChild(item);
  });

  suggestionsBox.classList.add('visible');
});

// ══════════════════════════════════════
// TOAST NOTIFICATION
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
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
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
  if (e.key === 'Escape')   { closePanel(); }

  // Alt+Left/Right for back/forward
  if (e.altKey && e.key === 'ArrowLeft')  btnBack.click();
  if (e.altKey && e.key === 'ArrowRight') btnForward.click();

  // Ctrl+1..9 switch tabs
  if (mod && e.key >= '1' && e.key <= '9') {
    const idx = +e.key - 1;
    if (tabs[idx]) setActiveTab(tabs[idx].id);
  }

  // Ctrl+Tab / Ctrl+Shift+Tab cycle tabs
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
// INIT
// ══════════════════════════════════════
async function init() {
  // Load settings first
  try {
    const s = await window.electronAPI?.settingsGet();
    if (s) settings = { ...settings, ...s };
  } catch(e) { console.warn('Settings load error:', e); }

  // Open with blank new tab
  createTab();
}

init();
