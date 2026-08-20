// theme.js — the shared appearance layer for every app in MyApps.
//
// All three apps are served from the same origin (pedrorebello1.github.io) on
// different paths, so localStorage is already shared between them. That is the
// whole sync mechanism: one key, plus a `storage` listener so a change in one
// open tab lands in the others immediately. No server, no account, no network.
//
// This file is duplicated verbatim into each app. It cannot be imported across
// repos — each one deploys standalone — so treat MyApps/hub/js/theme.js as the
// original and copy it outward when it changes. It is written as a plain
// script (no import/export, no module scope) precisely so findash can inline it
// into its single HTML file unchanged.
//
// The one idea worth holding on to: every theme below defines BOTH token
// vocabularies at once — the ink/chalk names Habit Grid's stylesheet asks for
// and the bg/panel/text names the financial dashboard asks for. Neither app's
// CSS had to be rewritten; each simply finds the names it already uses.

(function (global) {
  'use strict';

  var KEY = 'myapps.theme.v1';
  var EXCLUSIVE_PREFIX = 'myapps.theme.exclusive.';

  // ── the palette ───────────────────────────────────────────────────────────
  //
  // Twelve themes: ten dark, two light. Four came from Habit Grid, five from
  // the dashboard's palettes, and Sunset is new — it fills the slot left by
  // Grafite, which was dropped because Slate already occupied that exact
  // neutral-grey territory and two of them in one list read as a mistake.
  //
  // Each entry carries a `core` block (the surfaces and the accent) and a
  // `hues` block (the five semantic colours the dashboard needs for its charts
  // and badges: amber = primary/income, teal = saved, pink = investments,
  // red = over budget, green = healthy). Habit Grid ignores `hues`; the
  // dashboard ignores nothing. Light themes additionally carry `ink` variants
  // of the five hues, darkened to stay legible as text on a pale ground.

  var THEMES = [
    {
      id: 'ledger', label: 'Ledger', labelPt: 'Ledger', mode: 'dark',
      core: {
        bg: '#131210', panel: '#1C1A17', panelAlt: '#232019', sunken: '#0F0E0C',
        line: '#302B25', text: '#EDE7DA', muted: '#9A9186', faint: '#6C645A',
        accent: '#C6A15B', danger: '#C8654A',
        blobA: '#1C2029', blobB: '#1A1E26',
      },
      hues: { amber: '#C6A15B', amberDim: '#9A7B42', teal: '#5FA8A0', pink: '#C9647F', red: '#C8654A', green: '#7CA05A' },
    },
    {
      id: 'black', label: 'True black', labelPt: 'Preto puro', mode: 'dark',
      core: {
        bg: '#000000', panel: '#0C0B0A', panelAlt: '#151311', sunken: '#000000',
        line: '#262320', text: '#EDE7DA', muted: '#9A9186', faint: '#6C645A',
        accent: '#C6A15B', danger: '#C8654A',
        blobA: '#0C0B0A', blobB: '#080807',
      },
      hues: { amber: '#C6A15B', amberDim: '#9A7B42', teal: '#4FB3A6', pink: '#D06C88', red: '#D2705A', green: '#7BD88F' },
    },
    {
      id: 'slate', label: 'Slate', labelPt: 'Ardósia', mode: 'dark',
      core: {
        bg: '#10131A', panel: '#171B24', panelAlt: '#1E232E', sunken: '#0C0F14',
        line: '#2C3340', text: '#E4E8EF', muted: '#909AAB', faint: '#626C7C',
        accent: '#79A9CF', danger: '#D2705A',
        blobA: '#1A1F2A', blobB: '#161A23',
      },
      hues: { amber: '#79A9CF', amberDim: '#5B82A3', teal: '#2DD4BF', pink: '#C99BD8', red: '#D2705A', green: '#7BD88F' },
    },
    {
      id: 'midnight', label: 'Midnight', labelPt: 'Meia-noite', mode: 'dark',
      core: {
        bg: '#0D0F1C', panel: '#141726', panelAlt: '#1B1F32', sunken: '#0A0B14',
        line: '#2A2F48', text: '#E6E4F2', muted: '#9791B4', faint: '#6A6588',
        accent: '#8E97F5', danger: '#E0708A',
        blobA: '#181C30', blobB: '#141828',
      },
      hues: { amber: '#8E97F5', amberDim: '#6B73C4', teal: '#2DD4BF', pink: '#E879B9', red: '#E0708A', green: '#7BD88F' },
    },
    {
      id: 'ambar', label: 'Amber', labelPt: 'Âmbar', mode: 'dark',
      core: {
        bg: '#111318', panel: '#1B1E25', panelAlt: '#20242C', sunken: '#14161C',
        line: '#2B303A', text: '#F2F1EC', muted: '#8B909B', faint: '#5E636D',
        accent: '#FF8A2B', danger: '#EF4D6B',
        blobA: '#1C2029', blobB: '#1A1E26',
      },
      hues: { amber: '#FF8A2B', amberDim: '#C96A1F', teal: '#2DD4BF', pink: '#E879B9', red: '#EF4D6B', green: '#7BD88F' },
    },
    {
      id: 'safira', label: 'Sapphire', labelPt: 'Safira', mode: 'dark',
      core: {
        bg: '#10131C', panel: '#1A1E29', panelAlt: '#1F2430', sunken: '#13161F',
        line: '#2A3040', text: '#F0F2F7', muted: '#8B909B', faint: '#5E636D',
        accent: '#4F9DFF', danger: '#EF4D6B',
        blobA: '#1B2030', blobB: '#181C28',
      },
      hues: { amber: '#4F9DFF', amberDim: '#3D7BC9', teal: '#2DD4BF', pink: '#C084FC', red: '#EF4D6B', green: '#7BD88F' },
    },
    {
      id: 'esmeralda', label: 'Emerald', labelPt: 'Esmeralda', mode: 'dark',
      core: {
        bg: '#0F1712', panel: '#19221C', panelAlt: '#1E2820', sunken: '#121A15',
        line: '#28352C', text: '#ECF3EE', muted: '#8B978F', faint: '#5E6B63',
        accent: '#34D399', danger: '#F87171',
        blobA: '#1A231D', blobB: '#17201A',
      },
      hues: { amber: '#34D399', amberDim: '#279E73', teal: '#22D3EE', pink: '#E879B9', red: '#F87171', green: '#A3E635' },
    },
    {
      id: 'violeta', label: 'Violet', labelPt: 'Violeta', mode: 'dark',
      core: {
        bg: '#15121C', panel: '#201C2B', panelAlt: '#252031', sunken: '#191524',
        line: '#332C42', text: '#F0ECF7', muted: '#938DA3', faint: '#655F73',
        accent: '#A78BFA', danger: '#EF4D6B',
        blobA: '#221D2F', blobB: '#1C1826',
      },
      hues: { amber: '#A78BFA', amberDim: '#8168C9', teal: '#2DD4BF', pink: '#F472B6', red: '#EF4D6B', green: '#7BD88F' },
    },
    {
      id: 'coral', label: 'Coral', labelPt: 'Coral', mode: 'dark',
      core: {
        bg: '#1A1216', panel: '#261C20', panelAlt: '#2B2024', sunken: '#1E171A',
        line: '#3A2C31', text: '#F7ECEE', muted: '#9B8B8E', faint: '#6D6063',
        accent: '#FB7185', danger: '#F59E0B',
        blobA: '#281E22', blobB: '#20181B',
      },
      hues: { amber: '#FB7185', amberDim: '#C9586A', teal: '#2DD4BF', pink: '#E879B9', red: '#F59E0B', green: '#7BD88F' },
    },
    {
      // New. Warm dusk over a deep plum ground — the one place in the set where
      // the accent is a true orange-red rather than a brass or a rose.
      id: 'sunset', label: 'Sunset', labelPt: 'Poente', mode: 'dark',
      core: {
        bg: '#16101A', panel: '#221825', panelAlt: '#291D2C', sunken: '#1A1320',
        line: '#3A2A3C', text: '#F6EBEE', muted: '#A08D99', faint: '#6F6070',
        accent: '#F97A5B', danger: '#E5484D',
        blobA: '#2A1C2B', blobB: '#1E1522',
      },
      hues: { amber: '#F97A5B', amberDim: '#C25C43', teal: '#38BEC9', pink: '#E879B9', red: '#E5484D', green: '#8DBF6A' },
    },
    {
      id: 'paper', label: 'Paper', labelPt: 'Papel', mode: 'light',
      core: {
        bg: '#F1ECDF', panel: '#FBF7ED', panelAlt: '#EFE8D8', sunken: '#E8E1CF',
        line: '#DCD2BC', text: '#221F19', muted: '#6B6252', faint: '#948B78',
        accent: '#97762B', danger: '#B0472C',
        blobA: '#FBF7ED', blobB: '#F5F0E2',
      },
      hues: { amber: '#97762B', amberDim: '#7A5F22', teal: '#0A7A6E', pink: '#A81E80', red: '#B0472C', green: '#3F7A2E' },
      ink: { amber: '#7A5F22', teal: '#0A7A6E', pink: '#A81E80', red: '#B0472C', green: '#3F7A2E' },
    },
    {
      id: 'daylight', label: 'Daylight', labelPt: 'Luz do dia', mode: 'light',
      core: {
        bg: '#F4F6F8', panel: '#FFFFFF', panelAlt: '#EDF0F4', sunken: '#E9EDF2',
        line: '#D8DEE6', text: '#14181E', muted: '#5C6673', faint: '#8A94A1',
        accent: '#2F6FAF', danger: '#C0392B',
        blobA: '#FFFFFF', blobB: '#F5F7FB',
      },
      hues: { amber: '#2F6FAF', amberDim: '#245789', teal: '#0D8A7E', pink: '#C0266B', red: '#D9264A', green: '#188A45' },
      ink: { amber: '#1D5FC2', teal: '#0D8A7E', pink: '#C0266B', red: '#D9264A', green: '#188A45' },
    },
  ];

  var DEFAULT_THEME = 'ledger';
  var DEFAULT_DARK = 'ledger';
  var DEFAULT_LIGHT = 'paper';

  var byId = {};
  THEMES.forEach(function (t) { byId[t.id] = t; });

  // Findash stored its appearance as a palette id; those ids are now theme ids
  // one-for-one, except Grafite, which was dropped into Slate.
  var LEGACY = { grafite: 'slate', dark: 'ledger' };

  function resolveId(id) {
    if (!id) return null;
    if (byId[id]) return id;
    if (LEGACY[id] && byId[LEGACY[id]]) return LEGACY[id];
    return null;
  }

  // ── preference storage ────────────────────────────────────────────────────

  function defaults() {
    return {
      theme: DEFAULT_THEME,
      accent: null,          // null = the theme's own accent
      autoDark: DEFAULT_DARK,
      autoLight: DEFAULT_LIGHT,
    };
  }

  function read() {
    var pref = defaults();
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return pref; }
    if (!raw) return pref;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return pref; }
    if (!data || typeof data !== 'object') return pref;

    if (data.theme === 'auto') pref.theme = 'auto';
    else pref.theme = resolveId(data.theme) || DEFAULT_THEME;

    pref.accent = isHex(data.accent) ? data.accent : null;
    pref.autoDark = resolveId(data.autoDark) || DEFAULT_DARK;
    pref.autoLight = resolveId(data.autoLight) || DEFAULT_LIGHT;
    return pref;
  }

  function write(patch) {
    var next = read();
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
    return next;
  }

  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

  // Each app decides for itself whether it follows the shared preference. When
  // exclusive, it keeps a private copy under its own key and neither reads nor
  // writes the shared one — so changing the theme elsewhere leaves it alone,
  // and changing it here leaves the others alone.
  function exclusiveKey(app) { return EXCLUSIVE_PREFIX + app; }

  function isExclusive(app) {
    try { return localStorage.getItem(exclusiveKey(app)) !== null; } catch (e) { return false; }
  }

  function readExclusive(app) {
    var raw;
    try { raw = localStorage.getItem(exclusiveKey(app)); } catch (e) { return null; }
    if (!raw) return null;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    if (!data || typeof data !== 'object') return null;
    var pref = defaults();
    pref.theme = data.theme === 'auto' ? 'auto' : (resolveId(data.theme) || DEFAULT_THEME);
    pref.accent = isHex(data.accent) ? data.accent : null;
    pref.autoDark = resolveId(data.autoDark) || DEFAULT_DARK;
    pref.autoLight = resolveId(data.autoLight) || DEFAULT_LIGHT;
    return pref;
  }

  function writeExclusive(app, patch) {
    var next = readExclusive(app) || read();
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
    try { localStorage.setItem(exclusiveKey(app), JSON.stringify(next)); } catch (e) { /* ignore */ }
    return next;
  }

  /** Turning exclusive on seeds the private copy from whatever is on screen, so
   *  ticking the box never changes the appearance — it only stops the sync. */
  function setExclusive(app, on) {
    if (on) {
      writeExclusive(app, prefsFor(app));
    } else {
      try { localStorage.removeItem(exclusiveKey(app)); } catch (e) { /* ignore */ }
    }
  }

  function prefsFor(app) {
    var own = isExclusive(app) ? readExclusive(app) : null;
    return own || read();
  }

  function setFor(app, patch) {
    return isExclusive(app) ? writeExclusive(app, patch) : write(patch);
  }

  // ── applying ──────────────────────────────────────────────────────────────

  function prefersDark() {
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; }
    catch (e) { return true; }
  }

  /** Which theme is actually on screen for this app — resolves 'auto'. */
  function resolved(app) {
    var pref = prefsFor(app);
    if (pref.theme === 'auto') {
      return byId[prefersDark() ? pref.autoDark : pref.autoLight] || byId[DEFAULT_THEME];
    }
    return byId[pref.theme] || byId[DEFAULT_THEME];
  }

  /** Black or white, whichever reads better on the given colour — so a custom
   *  accent can never produce an unreadable label on a filled button. */
  function inkOn(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
    if (!m) return '#14120F';
    var n = parseInt(m[1], 16);
    var lin = function (c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    var L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#14120F' : '#FFFFFF';
  }

  /** Mixes `pct` of `color` into `base`, both #rrggbb. Used to derive the empty
   *  grid cell and the hairline-on-accent tints without a second palette. */
  function mix(color, base, pct) {
    var a = /^#?([0-9a-f]{6})$/i.exec(String(color || ''));
    var b = /^#?([0-9a-f]{6})$/i.exec(String(base || ''));
    if (!a || !b) return color;
    var x = parseInt(a[1], 16), y = parseInt(b[1], 16), out = '#';
    for (var s = 16; s >= 0; s -= 8) {
      var v = Math.round(((x >> s) & 255) * pct + ((y >> s) & 255) * (1 - pct));
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }

  /**
   * Writes the active theme onto <html> as custom properties, in BOTH token
   * vocabularies, and returns the theme that was applied.
   *
   * `app` names the caller ('habits' | 'findash' | 'hub') purely so the
   * exclusive flag can be looked up; the tokens themselves are identical
   * everywhere.
   */
  function apply(app) {
    var theme = resolved(app);
    var pref = prefsFor(app);
    var root = document.documentElement;
    var c = theme.core;
    var accent = isHex(pref.accent) ? pref.accent : c.accent;
    var isLight = theme.mode === 'light';

    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-mode', theme.mode);

    var set = function (name, value) { root.style.setProperty(name, value); };

    // color-scheme drives the native form controls and scrollbars.
    set('color-scheme', theme.mode);
    try { root.style.colorScheme = theme.mode; } catch (e) { /* older engines */ }

    // -- Habit Grid's vocabulary
    set('--ink-900', c.bg);
    set('--ink-800', c.panel);
    set('--ink-700', c.panelAlt);
    set('--ink-600', mix(c.text, c.panelAlt, isLight ? 0.10 : 0.07));
    set('--hairline', c.line);
    set('--chalk', c.text);
    set('--chalk-dim', c.muted);
    set('--chalk-faint', c.faint);
    set('--accent', accent);
    set('--danger', c.danger);
    set('--on-fill', isLight ? '#FFFFFF' : mix(c.bg, '#000000', 0.7));
    set('--on-accent', inkOn(accent));
    set('--scrim', isLight ? 'rgba(40, 33, 20, .38)' : 'rgba(6, 5, 4, .62)');
    set('--shadow', isLight ? 'rgba(60, 50, 30, .18)' : 'rgba(0, 0, 0, .5)');

    // -- the dashboard's vocabulary
    var h = theme.hues;
    var ink = theme.ink || h;
    set('--bg', c.bg);
    set('--panel', c.panel);
    set('--panel-alt', c.panelAlt);
    set('--line', c.line);
    set('--text', c.text);
    set('--muted', c.muted);
    set('--muted-dim', c.faint);
    set('--surface-sunken', c.sunken);
    set('--bg-blob-a', c.blobA);
    set('--bg-blob-b', c.blobB);
    set('--nav-bg', hexToRgba(c.bg, isLight ? 0.85 : 0.92));
    set('--note-text', ink.teal);

    // The vivid hues stay vivid in both modes — they fill donut segments and
    // badge backgrounds, where saturation is the point. The -ink variants are
    // what gets used as text on the page ground, and only those darken.
    set('--amber', h.amber);
    set('--amber-dim', h.amberDim);
    set('--teal', h.teal);
    set('--pink', h.pink);
    set('--red', h.red);
    set('--green', h.green);
    set('--amber-ink', isHex(pref.accent) ? pref.accent : ink.amber);
    set('--teal-ink', ink.teal);
    set('--pink-ink', ink.pink);
    set('--red-ink', ink.red);
    set('--green-ink', ink.green);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.bg);

    return theme;
  }

  function hexToRgba(hex, alpha) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  // ── live sync ─────────────────────────────────────────────────────────────
  //
  // Another app on this origin wrote the shared preference (or this app's own
  // exclusive flag was toggled from elsewhere). Re-apply, then let the caller
  // repaint anything that reads colours in JS rather than CSS.

  function watch(app, onChange) {
    var handler = function (e) {
      if (e.key !== null && e.key !== KEY && e.key !== exclusiveKey(app)) return;
      var theme = apply(app);
      if (onChange) onChange(theme);
    };
    try { window.addEventListener('storage', handler); } catch (e) { /* ignore */ }

    // 'auto' has to track the OS while the app is open, too.
    var mq;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mq = null; }
    var onScheme = function () {
      if (prefsFor(app).theme !== 'auto') return;
      var theme = apply(app);
      if (onChange) onChange(theme);
    };
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }

    return function stop() {
      try { window.removeEventListener('storage', handler); } catch (e) { /* ignore */ }
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', onScheme);
        else if (mq.removeListener) mq.removeListener(onScheme);
      }
    };
  }

  global.MyAppsTheme = {
    KEY: KEY,
    THEMES: THEMES,
    DEFAULT_THEME: DEFAULT_THEME,
    byId: byId,
    resolveId: resolveId,
    get: prefsFor,
    set: setFor,
    isExclusive: isExclusive,
    setExclusive: setExclusive,
    resolved: resolved,
    apply: apply,
    watch: watch,
    inkOn: inkOn,
    mix: mix,
    label: function (id, lang) {
      var t = byId[id];
      if (!t) return id;
      return (lang === 'pt-BR' && t.labelPt) ? t.labelPt : t.label;
    },
  };
})(typeof window !== 'undefined' ? window : this);
