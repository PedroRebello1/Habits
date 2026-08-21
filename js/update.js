// update.js — "a new version is ready" for every app in MyApps.
//
// This file is duplicated verbatim into each app, the same way theme.js is:
// they deploy as separate repos and cannot import across origins. The original
// is hub/js/update.js — copy it outward when it changes.
//
// ── why reloading did not reliably update ────────────────────────────────────
//
// A service worker that calls skipWaiting() inside its `install` handler
// activates as soon as it is installed, but that does NOT hand it the pages
// that are already open. Those stay controlled by the previous worker until
// every tab for the scope is closed — so pressing reload fetched the old
// cached shell again and nothing appeared to change. The usual advice, "just
// reload", is exactly the thing that does not work here.
//
// What does work, and what this module does:
//
//   1. Never skipWaiting() on install. The new worker sits in `waiting`.
//   2. Notice it is waiting (on registration, on updatefound, and on every
//      return to the tab) and show a bar that does not time out.
//   3. When the button is pressed, message the WAITING worker to skipWaiting.
//   4. Reload from the 'controllerchange' event — that is the moment the new
//      worker is actually in charge, so the reload is guaranteed to be served
//      the new shell rather than racing the handover.
//
// Step 4 is the part that makes it deterministic. Reloading immediately after
// postMessage is a race: the page can reload before the new worker has claimed
// it, and come back on the old version again.

(function (global) {
  'use strict';

  var STRINGS = {
    en: { ready: 'A new version is ready.', reload: 'Update now', updating: 'Updating…' },
    'pt-BR': { ready: 'Uma nova versão está pronta.', reload: 'Atualizar agora', updating: 'Atualizando…' },
  };

  var BAR_ID = 'myapps-update-bar';
  var STYLE_ID = 'myapps-update-style';

  // Styling comes from theme tokens where they exist, with literal fallbacks so
  // the bar is legible even in an app that has not loaded theme.js.
  var CSS = [
    '#' + BAR_ID + '{',
    '  position:fixed;left:0;right:0;bottom:0;z-index:9999;',
    '  display:flex;align-items:center;gap:12px;',
    '  padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));',
    '  background:var(--ink-700,var(--panel-alt,#232019));',
    '  color:var(--chalk,var(--text,#EDE7DA));',
    '  border-top:1px solid var(--hairline,var(--line,#302B25));',
    '  box-shadow:0 -6px 24px var(--shadow,rgba(0,0,0,.45));',
    '  font-family:var(--font-ui,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);',
    '  font-size:14px;line-height:1.35;',
    '  animation:myapps-update-rise .22s cubic-bezier(.2,.8,.3,1);',
    '}',
    '#' + BAR_ID + ' .mu-msg{flex:1;min-width:0;}',
    '#' + BAR_ID + ' button{',
    '  flex:none;font:inherit;font-weight:500;cursor:pointer;',
    '  padding:9px 15px;border-radius:10px;border:0;',
    '  background:var(--accent,var(--amber,#C6A15B));',
    '  color:var(--on-accent,var(--bg,#14120F));',
    '  -webkit-tap-highlight-color:transparent;',
    '}',
    '#' + BAR_ID + ' button:disabled{opacity:.6;cursor:default;}',
    '#' + BAR_ID + ' button:active:not(:disabled){transform:scale(.97);}',
    '@keyframes myapps-update-rise{from{transform:translateY(100%);}}',
    '@media (prefers-reduced-motion:reduce){',
    '  #' + BAR_ID + '{animation:none;}',
    '  #' + BAR_ID + ' button:active{transform:none;}',
    '}',
  ].join('\n');

  /** The page's own `lang` wins when it declares one — the dashboard is
   *  pt-BR whatever the browser is set to, and Habit Grid follows its own
   *  language setting. Only when the document says nothing does the browser's
   *  preference decide. */
  function strings() {
    var docLang = '';
    try { docLang = (document.documentElement.lang || '').toLowerCase(); } catch (e) {}
    if (docLang) return STRINGS[docLang.indexOf('pt') === 0 ? 'pt-BR' : 'en'];

    var navLang = '';
    try {
      navLang = ((navigator.languages && navigator.languages[0])
        || navigator.language || '').toLowerCase();
    } catch (e) {}
    return STRINGS[navLang.indexOf('pt') === 0 ? 'pt-BR' : 'en'];
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  var shown = false;
  var reloading = false;

  // Indirected so tests can observe the reload instead of performing it.
  function doReload() {
    if (reloading) return;
    reloading = true;
    (global.__myappsReload || function () { location.reload(); })();
  }

  /** The bar. Deliberately has no dismiss and no timeout: it is reporting that
   *  the running code is stale, which stays true until it is acted on. */
  function showBar(onUpdate) {
    if (shown || document.getElementById(BAR_ID)) return;
    shown = true;
    injectStyle();

    var s = strings();
    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');

    var msg = document.createElement('span');
    msg.className = 'mu-msg';
    msg.textContent = s.ready;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = s.reload;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = s.updating;
      onUpdate();
    });

    bar.appendChild(msg);
    bar.appendChild(btn);
    (document.body || document.documentElement).appendChild(bar);
  }

  /**
   * Wires update handling for one app.
   *
   * `swUrl` is relative on purpose — on GitHub Pages each app lives under
   * /<repo>/, and an absolute path would register with the wrong scope.
   */
  function init(swUrl) {
    if (!('serviceWorker' in navigator)) return;

    var url = swUrl || './sw.js';

    // The handover. Firing the reload here rather than straight after
    // postMessage is what makes this reliable: by the time this fires, the new
    // worker controls the page, so the reload is served the new shell.
    navigator.serviceWorker.addEventListener('controllerchange', doReload);

    navigator.serviceWorker.register(url).then(function (reg) {
      // A worker already waiting when the page loaded — the common case when
      // the update landed during a previous visit.
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);

      reg.addEventListener('updatefound', function () {
        var next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', function () {
          // `controller` being null means this is the first install of all —
          // nothing is stale, so there is nothing to announce.
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            offer(next);
          }
        });
      });

      // Coming back to the tab is a good moment to look for a new version, and
      // to surface one that arrived while the tab was in the background.
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.update().catch(function () { /* offline; try again next time */ });
      });

      // A long-lived tab should not have to be revisited to notice an update.
      setInterval(function () {
        reg.update().catch(function () { /* offline */ });
      }, 60 * 60 * 1000);
    }).catch(function () {
      /* Offline support is a bonus, not a requirement. */
    });

    function offer(worker) {
      showBar(function () {
        // Ask the waiting worker to take over. The controllerchange listener
        // above does the reload once it actually has.
        worker.postMessage('skip-waiting');
        // Safety net: if the handover does not happen (an old worker without
        // the message handler, say), reload anyway rather than hanging on
        // "Updating…" forever.
        setTimeout(doReload, 3000);
      });
    }
  }

  global.MyAppsUpdate = { init: init, showBar: showBar };
})(typeof window !== 'undefined' ? window : this);
