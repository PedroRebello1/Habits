// main.js — router, boot and the lifecycle listeners that keep a long-lived
// tab honest: midnight rollover, another tab writing, and failed saves.

import * as state from './state.js';
import * as storage from './storage.js';
import * as views from './views.js';
import { todayKey } from './dates.js';

const app = document.getElementById('app');
let current = null;
let lastToday = todayKey();

// -- routing -----------------------------------------------------------------

function parse() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  return { name, id: parts[1] || null };
}

function view(route) {
  switch (route.name) {
    case 'welcome': return views.onboarding();
    case 'week': return views.week();
    case 'habit': return views.detail(route.id);
    case 'new': return views.editor(null);
    case 'edit': return views.editor(route.id);
    case 'settings': return views.settings();
    default: return views.home();
  }
}

function render() {
  const route = parse();

  // Nothing has ever been stored: onboarding comes first, whatever the hash.
  if (state.isFresh() && route.name !== 'welcome') {
    location.replace('#/welcome');
    return;
  }
  if (!state.isFresh() && route.name === 'welcome') {
    location.replace('#/home');
    return;
  }

  views.closeSheet();
  if (current && current.destroy) current.destroy();
  app.textContent = '';
  current = view(route);
  app.appendChild(current.el);
  window.scrollTo(0, 0);
  document.title = route.name === 'home' ? 'Habit Grid' : 'Habit Grid — ' + route.name;
}

window.addEventListener('hashchange', render);
views.setRerender(render);

// -- state plumbing ----------------------------------------------------------

// A tick refreshes in place so grid scroll positions survive; anything
// structural rebuilds the screen.
state.subscribe((detail) => {
  if (!current) return;
  const structural = detail.added || detail.deleted || detail.restored
    || detail.reordered || detail.wholesale;
  if (structural) render();
  else if (current.update) current.update(detail);
});

storage.onError((err) => {
  views.toast(storage.describeError(err), { error: true, timeout: 9000 });
});

// Another tab wrote to the same key. Reload rather than clobber it.
storage.onExternalChange((next) => {
  if (!next) return;
  state.adopt(next, { persist: false });
  views.toast('Updated from another tab.');
});

// A tab left open overnight must not tick yesterday.
function checkRollover() {
  const now = todayKey();
  if (now === lastToday) return;
  lastToday = now;
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkRollover();
});
window.addEventListener('focus', checkRollover);
setInterval(checkRollover, 60000);

window.addEventListener('pagehide', () => storage.flush());

// -- install prompt ----------------------------------------------------------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  views.setInstallPrompt(e);
});
window.addEventListener('appinstalled', () => {
  views.setInstallPrompt(null);
  views.toast('Installed. It works offline now.');
});

// -- service worker ----------------------------------------------------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative path on purpose: on GitHub Pages the site lives at /<repo>/,
    // and an absolute /sw.js would silently register with the wrong scope.
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            views.toast('A new version is ready.', {
              action: 'Reload',
              timeout: 12000,
              onAction: () => { next.postMessage('skip-waiting'); location.reload(); },
            });
          }
        });
      });
    }).catch(() => { /* offline support is a bonus, not a requirement */ });
  });
}

// -- boot --------------------------------------------------------------------

state.boot();
views.applyTheme();
if (!location.hash) location.replace(state.isFresh() ? '#/welcome' : '#/home');
render();
