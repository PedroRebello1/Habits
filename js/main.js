// main.js — router, boot and the lifecycle listeners that keep a long-lived
// tab honest: midnight rollover, another tab writing, and failed saves.

import * as state from './state.js';
import * as storage from './storage.js';
import * as views from './views.js';
import { todayKey } from './dates.js';
import { t } from './i18n.js';

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
  const titles = {
    week: 'week.title', new: 'edit.new', edit: 'edit.edit', settings: 'common.settings',
  };
  const habit = route.name === 'habit' && state.habit(route.id);
  document.title = habit ? t('app.name') + ' — ' + habit.name
    : titles[route.name] ? t('app.name') + ' — ' + t(titles[route.name])
    : t('app.name');
}

window.addEventListener('hashchange', render);
views.setRerender(render);

// -- state plumbing ----------------------------------------------------------

// A tick refreshes in place so grid scroll positions survive; anything
// structural rebuilds the screen.
state.subscribe((detail) => {
  if (!current) return;
  if (detail.wholesale) {
    // An import or a backup restore can carry a different language, theme and
    // accent. Re-apply them before painting, or the screen keeps the old ones.
    views.applyLang();
    views.applyTheme();
  }
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
  views.toast(t('app.otherTab'));
});

// Auto theme follows the OS, including a change while the app is open.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const onSchemeChange = () => {
  if (state.settings().theme === 'auto') { views.applyTheme(); render(); }
};
if (darkQuery.addEventListener) darkQuery.addEventListener('change', onSchemeChange);
else if (darkQuery.addListener) darkQuery.addListener(onSchemeChange);

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
  views.toast(t('app.installed'));
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
            views.toast(t('sw.updated'), {
              action: t('sw.reload'),
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
views.applyLang();
views.applyTheme();
if (!location.hash) location.replace(state.isFresh() ? '#/welcome' : '#/home');
render();
