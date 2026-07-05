/* ═══════════════════════════════════════
   GlassyWeb — Guest Page Preload (v1.2.2)
   Fingerprint protection + Dark Mode + PiP helpers.

   Loaded via <webview preload="...">. contextIsolation for the GUEST
   page is toggled by the "Fingerprinting Protection" setting:
     - ON  -> contextIsolation=no  (this script runs in the page's real
              main world, so it can actually patch navigator/canvas/etc.
              before the page's own scripts run)
     - OFF -> contextIsolation=yes (deep patches below would only affect
              this isolated copy of those globals, not the real page —
              so they're a harmless no-op, effectively "disabled")

   Dark Mode and Picture-in-Picture don't need to patch prototypes —
   they only touch the DOM (which is shared between isolated/main
   worlds) — so they're exposed via contextBridge and work either way.
   ═══════════════════════════════════════ */
(function () {
  'use strict';

  const isolated = !!process.contextIsolated;
  let contextBridge;
  try { contextBridge = require('electron').contextBridge; } catch {}

  function exposeGlobal(name, fn) {
    if (isolated && contextBridge) {
      try { contextBridge.exposeInMainWorld(name, fn); return; } catch {}
    }
    try { window[name] = fn; } catch {}
  }

  // ══════════════════════════════════════
  // FINGERPRINT PROTECTION — only has real effect when unisolated
  // ══════════════════════════════════════
  if (!isolated) {
    try {
      const SEED = (function () {
        try {
          const key = '__gw_fp_seed__';
          let s = sessionStorage.getItem(key);
          if (!s) { s = String(Math.random()); sessionStorage.setItem(key, s); }
          return parseFloat(s) || 0.42;
        } catch { return 0.42; }
      })();

      const noise = (base, amount) => base + (SEED - 0.5) * amount;

      const define = (obj, prop, value) => {
        try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch {}
      };

      define(navigator, 'hardwareConcurrency', 4);
      if ('deviceMemory' in navigator) define(navigator, 'deviceMemory', 8);

      if (navigator.getBattery) {
        navigator.getBattery = () => Promise.reject(new Error('Battery API disabled'));
      }

      define(navigator, 'plugins', Object.freeze([]));
      define(navigator, 'mimeTypes', Object.freeze([]));

      const patchCanvas = () => {
        const proto = HTMLCanvasElement.prototype;
        const origToDataURL = proto.toDataURL;
        const origGetContext = proto.getContext;

        proto.getContext = function (type, ...args) {
          const ctx = origGetContext.apply(this, [type, ...args]);
          if (ctx && type === '2d' && !ctx.__gw_patched) {
            const origGetImageData = ctx.getImageData;
            ctx.getImageData = function (...a) {
              const data = origGetImageData.apply(this, a);
              for (let i = 0; i < data.data.length; i += 97) {
                data.data[i] = Math.max(0, Math.min(255, data.data[i] + Math.round(noise(0, 4))));
              }
              return data;
            };
            ctx.__gw_patched = true;
          }
          return ctx;
        };

        proto.toDataURL = function (...args) {
          try {
            const ctx = this.getContext('2d');
            if (ctx) {
              const w = Math.min(this.width, 4), h = Math.min(this.height, 4);
              if (w && h) ctx.putImageData(ctx.getImageData(0, 0, w, h), 0, 0);
            }
          } catch {}
          return origToDataURL.apply(this, args);
        };
      };
      if (window.HTMLCanvasElement) patchCanvas();

      const patchAudio = (Ctx) => {
        if (!Ctx) return;
        const origCreateAnalyser = Ctx.prototype.createAnalyser;
        Ctx.prototype.createAnalyser = function (...args) {
          const analyser = origCreateAnalyser.apply(this, args);
          const origGetFloatFreq = analyser.getFloatFrequencyData;
          analyser.getFloatFrequencyData = function (arr) {
            origGetFloatFreq.call(this, arr);
            for (let i = 0; i < arr.length; i += 50) arr[i] += noise(0, 0.0001);
          };
          return analyser;
        };
      };
      patchAudio(window.AudioContext);
      patchAudio(window.OfflineAudioContext);

      const maskWebGL = (proto) => {
        if (!proto) return;
        const origGetParameter = proto.getParameter;
        proto.getParameter = function (param) {
          if (param === 37445) return 'Generic Renderer'; // UNMASKED_VENDOR_WEBGL
          if (param === 37446) return 'Generic GPU';       // UNMASKED_RENDERER_WEBGL
          return origGetParameter.apply(this, [param]);
        };
      };
      if (window.WebGLRenderingContext) maskWebGL(window.WebGLRenderingContext.prototype);
      if (window.WebGL2RenderingContext) maskWebGL(window.WebGL2RenderingContext.prototype);

      if (document.fonts && document.fonts.check) {
        const origCheck = document.fonts.check.bind(document.fonts);
        const COMMON = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'];
        document.fonts.check = function (font, ...rest) {
          return COMMON.some(f => font.includes(f)) ? origCheck(font, ...rest) : false;
        };
      }

      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
        navigator.mediaDevices.enumerateDevices = async function () {
          const devices = await origEnumerate();
          return devices.map(d => ({
            deviceId: d.label ? d.deviceId : '',
            groupId: d.label ? d.groupId : '',
            kind: d.kind,
            label: d.label,
          }));
        };
      }
    } catch (e) {
      console.warn('[GlassyWeb] fingerprint protection init error', e);
    }
  }

  // ══════════════════════════════════════
  // SMART FORCED DARK MODE
  // A blanket invert() makes already-dark sites turn light, which looks
  // broken. Instead: sample the page's actual background luminance and
  // only invert if the site is genuinely light. Only real media
  // elements (img/video/canvas/svg/iframe) get counter-inverted — not
  // every element with a CSS background-image — so large content
  // blocks don't get double-flipped back to "light" by mistake.
  // ══════════════════════════════════════
  function getBgLuminance() {
    let node = document.body;
    let hops = 0;
    while (node && hops < 6) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg && bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/);
      if (m) {
        const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
        if (a > 0.05) {
          const r = +m[1], g = +m[2], b = +m[3];
          return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
      }
      node = node.parentElement;
      hops++;
    }
    return 1; // nothing opaque found -> default page background is white
  }

  const DARK_STYLE_ID = 'glassy-forced-dark-style';

  exposeGlobal('__glassyApplyDarkMode', function () {
    if (document.getElementById(DARK_STYLE_ID)) return { success: true, already: true };
    if (getBgLuminance() < 0.4) return { success: true, skipped: true }; // already dark, leave it
    const style = document.createElement('style');
    style.id = DARK_STYLE_ID;
    style.textContent = `
      html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
      img, video, picture, canvas, svg, iframe {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    return { success: true, applied: true };
  });

  exposeGlobal('__glassyRemoveDarkMode', function () {
    const el = document.getElementById(DARK_STYLE_ID);
    if (el) el.remove();
    return { success: true };
  });

  // ══════════════════════════════════════
  // UNIVERSAL PICTURE-IN-PICTURE
  // The app shell calls this via executeJavaScript(..., true) with a
  // user gesture when the PiP button is clicked, satisfying the
  // browser's "must be triggered by a user gesture" requirement.
  // ══════════════════════════════════════
  exposeGlobal('__glassyRequestPiP', function () {
    try {
      const videos = Array.from(document.querySelectorAll('video'));
      const playing = videos.find(v => !v.paused && v.readyState > 2) || videos[0];
      if (!playing) return { success: false, error: 'No video found on this page' };
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
        return { success: true, exited: true };
      }
      playing.requestPictureInPicture();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
})();
