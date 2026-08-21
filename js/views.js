// views.js — every screen, plus the sheets and toasts they share.
//
// A view returns { el, update(detail) }. The router swaps views; update() lets
// a view respond to a tick without a full rebuild, so grid scroll positions
// survive.

import * as state from './state.js';
import * as storage from './storage.js';
import * as io from './io.js';
import { statsFor } from './stats.js';
import { createGrid } from './grid.js';
import {
  todayKey, addDays, addMonths, rangeStart, RANGES,
  dayOf, monthOf, yearOf, daysInMonth, weekdayIndex, diffDays,
} from './dates.js';
import {
  t, plural, setLang, detectLang, LANGUAGES, rangeLabel, themeLabel,
  longDate, shortDate, monthYear, weekdayLetter, weekdayLetters, weekdayName,
} from './i18n.js';

export const ICON_GROUPS = [
  { name: 'Movement',   icons: ['run', 'walk', 'bike', 'swim', 'dumbbell', 'stretch'] },
  { name: 'Body',       icons: ['water', 'sleep', 'pill', 'apple', 'tooth', 'heart'] },
  { name: 'Mind',       icons: ['book', 'pen', 'headphones', 'brain', 'sun', 'lotus'] },
  { name: 'Craft',      icons: ['code', 'camera', 'brush', 'guitar', 'tools', 'plant'] },
  { name: 'Home',       icons: ['broom', 'laundry', 'dish', 'wallet', 'bed', 'phone-down'] },
  { name: 'Discipline', icons: ['no-smoking', 'no-drink', 'no-sugar', 'no-screen', 'flame', 'check'] },
];

export const EMOJI = [
  '📚', '✍️', '🎧', '🧠', '🎯', '💡', '🎨', '🎸', '📷', '💻',
  '🏃', '🚶', '🚴', '🏊', '🏋️', '🧘', '⚽', '🥊', '⛰️', '🤸',
  '💧', '🥗', '🍎', '🥦', '💊', '🦷', '😴', '🧴', '🩺', '❤️',
  '🌱', '🌞', '🌙', '🔥', '⭐', '🕯️', '🧹', '🧺', '🍳', '💰',
  '🙏', '📵', '🚭', '🍺', '🍬', '☕', '🐕', '👨‍👩‍👧', '📞', '✅',
];

// Twelve swatches tuned for this background; each clears 3:1 against the card
// at full intensity.
export const SWATCHES = [
  '#C6A15B', '#D9922E', '#C8654A', '#B07C5A',
  '#C9647F', '#A46FB5', '#7C8CE0', '#5FA8D3',
  '#3FA9A0', '#7CA05A', '#A0A052', '#A9A29A',
];

// The palette now lives in js/theme.js, shared byte-for-byte with the other
// apps on this origin so a theme picked in one is the theme in all of them.
// This app id is what the exclusive-theme switch keys off.
const APP_ID = 'habits';
const Theme = window.MyAppsTheme;

export const THEMES = Theme.THEMES;
export const DEFAULT_THEME = Theme.DEFAULT_THEME;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Black or white, whichever reads better on the given colour. Used for text
 *  sitting on an accent button or on a filled cell, so a custom colour cannot
 *  produce an unreadable label. Lives in the shared theme engine now, since
 *  the dashboard needs the same rule for the same reason. */
export const inkOn = Theme.inkOn;

/** Inline style for anything tinted by one habit. */
export function habitStyle(hb) {
  return '--habit:' + hb.color + ';--on-fill:' + inkOn(hb.color);
}

// -- tiny DOM helpers --------------------------------------------------------

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && k !== 'list' && k !== 'size') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false || kid === true) continue;
    if (Array.isArray(kid)) { append(el, kid); continue; }
    el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  }
}

export function icon(name, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls || 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

/** The habit's mark — one SVG symbol, one emoji or one letter, all coloured by
 *  the same --habit custom property. */
export function glyph(hb, big) {
  const box = h('span', { class: 'habit-icon' + (big ? ' lg' : ''), 'aria-hidden': 'true' });
  const ic = hb.icon || { type: 'letter', value: 'H' };
  if (ic.type === 'svg') box.appendChild(icon(ic.value, ''));
  else if (ic.type === 'emoji') box.appendChild(h('span', { class: 'emoji', text: ic.value }));
  else box.appendChild(h('span', { class: 'letter', text: (ic.value || '?').slice(0, 1).toUpperCase() }));
  return box;
}

const pct = (n) => Math.round(n * 100) + '%';

// -- toasts ------------------------------------------------------------------

const toastRoot = () => document.getElementById('toast-root');

export function toast(message, opts) {
  const o = opts || {};
  const el = h('div', { class: 'toast' + (o.error ? ' is-error' : '') },
    h('span', { class: 'msg', text: message }));
  let timer = 0;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (o.action) {
    el.appendChild(h('button', {
      type: 'button', text: o.action,
      onClick: () => { close(); if (o.onAction) o.onAction(); },
    }));
  }
  el.appendChild(h('button', {
    type: 'button', class: 'faint', 'aria-label': t('common.dismiss'), onClick: close,
  }, icon('close')));
  toastRoot().appendChild(el);
  timer = setTimeout(close, o.timeout || (o.error ? 7000 : 4000));
  return close;
}

// -- sheets ------------------------------------------------------------------

let closeCurrentSheet = null;

export function closeSheet() {
  if (closeCurrentSheet) closeCurrentSheet();
}

export function openSheet(build) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  const returnTo = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const sheet = h('div', {
    class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabIndex: -1,
  }, h('div', { class: 'grab', 'aria-hidden': 'true' }));

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    sheet.remove();
    closeCurrentSheet = null;
    if (returnTo && returnTo.focus) returnTo.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  closeCurrentSheet = close;

  build(sheet, close);
  root.appendChild(backdrop);
  root.appendChild(sheet);
  const first = sheet.querySelector('button, input, select, [tabindex]');
  (first || sheet).focus();
  return close;
}

/** Small popover anchored to a cell, for exact edits. */
function openPopover(anchor, build) {
  const root = document.getElementById('sheet-root');
  const existing = root.querySelector('.pop');
  if (existing) existing.remove();
  const pop = h('div', { class: 'pop', role: 'dialog' });
  build(pop, () => teardown());

  const onAway = (e) => { if (!pop.contains(e.target)) teardown(); };
  const onKey = (e) => { if (e.key === 'Escape') teardown(); };
  function teardown() {
    document.removeEventListener('pointerdown', onAway, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', teardown, true);
    pop.remove();
  }

  root.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, ht = pop.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = r.top - ht - 8;
  if (top < 8) top = r.bottom + 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  setTimeout(() => {
    document.addEventListener('pointerdown', onAway, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', teardown, true);
  }, 0);
  const btn = pop.querySelector('button');
  if (btn) btn.focus();
}

function stepper(value, min, max, onChange, label) {
  const val = h('span', { class: 'val', text: String(value) });
  let n = value;
  const dec = h('button', { type: 'button', 'aria-label': t('edit.decrease', { label: label || '' }) }, icon('minus'));
  const inc = h('button', { type: 'button', 'aria-label': t('edit.increase', { label: label || '' }) }, icon('plus'));
  const sync = () => {
    val.textContent = String(n);
    dec.disabled = n <= min;
    inc.disabled = n >= max;
  };
  dec.addEventListener('click', () => { if (n > min) { n--; sync(); onChange(n); } });
  inc.addEventListener('click', () => { if (n < max) { n++; sync(); onChange(n); } });
  sync();
  const box = h('div', { class: 'stepper' }, dec, val, inc);
  box.set = (next) => { n = next; sync(); };
  return box;
}

// -- install prompt ----------------------------------------------------------

let deferredInstall = null;

export function setInstallPrompt(e) { deferredInstall = e; }
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}
export function canInstall() { return !!deferredInstall && !isStandalone(); }
export function promptInstall() {
  if (!deferredInstall) return Promise.resolve(false);
  const ev = deferredInstall;
  deferredInstall = null;
  ev.prompt();
  return ev.userChoice.then(r => r && r.outcome === 'accepted');
}

// -- shared pieces -----------------------------------------------------------

function topbar(title, opts) {
  const o = opts || {};
  const bar = h('header', { class: 'topbar' });
  if (o.back) {
    bar.appendChild(h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': t('common.back'),
      onClick: () => { if (typeof o.back === 'function') o.back(); else history.back(); },
    }, icon('back')));
  }
  const titles = h('div', {}, h('div', { class: 'brand', text: title }));
  if (o.sub) titles.appendChild(h('div', { class: 'sub', text: o.sub }));
  bar.appendChild(titles);
  bar.appendChild(h('div', { class: 'topbar-spacer' }));
  (o.actions || []).forEach(a => bar.appendChild(a));
  return bar;
}

function go(hash) { location.hash = hash; }

function tickLabel(hb, count) {
  if (hb.target > 1) return t('common.ofDone', { n: count, t: hb.target });
  return t(count > 0 ? 'common.done' : 'common.notDone');
}

function tickButton(hb, onTick) {
  const btn = h('button', { type: 'button', class: 'tick' });
  const paint = () => {
    const n = state.count(hb.id, todayKey());
    btn.textContent = '';
    btn.classList.toggle('is-done', n >= hb.target);
    btn.classList.toggle('is-part', n > 0 && n < hb.target);
    if (hb.target > 1) btn.appendChild(document.createTextNode(n + '/' + hb.target));
    else btn.appendChild(icon('check'));
    btn.setAttribute('aria-label', t('home.todayAria', { name: hb.name, status: tickLabel(hb, n) }));
  };
  btn.addEventListener('click', () => {
    state.cycle(hb.id, todayKey());
    paint();
    if (onTick) onTick();
  });
  paint();
  btn.paint = paint;
  return btn;
}

function streakLine(hb) {
  const line = h('div', { class: 'meta' });
  const paint = () => {
    const s = statsFor(hb.id);
    line.textContent = '';
    if (s.current > 0) {
      line.appendChild(icon('flame', ''));
      line.appendChild(h('span', { class: 'n', text: String(s.current) }));
      line.appendChild(document.createTextNode(' ' + t(s.current === 1 ? 'stat.unit.day' : 'stat.unit.days')));
    } else if (s.completions > 0) {
      line.appendChild(document.createTextNode(
        t('home.noStreak', { total: plural(s.completions, 'n.day') })));
    } else {
      line.appendChild(document.createTextNode(t('home.notStarted')));
    }
    if (hb.target > 1) {
      line.appendChild(document.createTextNode(' · ' + t('home.perDay', { n: hb.target })));
    }
  };
  paint();
  line.paint = paint;
  return line;
}

/** Writing to a day before the habit existed moves createdAt back, so the
 *  completion rate stays honest when you backfill history. */
function writeFor(hb) {
  return (dateKey, n) => {
    if (n > 0 && dateKey < hb.createdAt) {
      state.extendStart(hb.id, dateKey);
      hb.createdAt = dateKey;
    }
    state.setCount(hb.id, dateKey, n);
  };
}

function gridFor(hb, opts) {
  const o = opts || {};
  const settings = state.settings();
  const range = o.range || hb.range;
  const grid = createGrid({
    range,
    startKey: rangeStart(range, hb.createdAt),
    createdAt: hb.createdAt,
    target: hb.target,
    weekStart: settings.weekStart,
    pref: settings.density,
    interactive: o.interactive !== false,
    showToday: o.showToday !== false,
    read: (k) => state.count(hb.id, k),
    write: writeFor(hb),
    onTick: o.onTick,
    onZoom: (from, to, unit) => openZoom(hb, from, to, unit, o.onTick),
    onStep: (dateKey, node) => openStepper(hb, dateKey, node, o.onTick),
  });
  return grid;
}

function openStepper(hb, dateKey, anchor, onTick) {
  openPopover(anchor, (pop) => {
    pop.appendChild(h('div', { class: 'date', text: longDate(dateKey) }));
    const box = stepper(state.count(hb.id, dateKey), 0, 99, (n) => {
      writeFor(hb)(dateKey, n);
      if (onTick) onTick();
    }, t('edit.countFor', { date: longDate(dateKey) }));
    pop.appendChild(box);
  });
}

/** Aggregate cells cannot be ticked — you cannot do "March". Tapping one opens
 *  the period at day density instead. */
function openZoom(hb, from, to, unit, onTick) {
  openSheet((sheet, close) => {
    const title = unit === 'month' ? monthYear(from) : t('zoom.weekOf', { date: longDate(from) });
    sheet.appendChild(h('h3', { class: 'display', text: title }));
    sheet.appendChild(h('p', { text: t('zoom.tapADay') }));

    const weekStart = state.settings().weekStart;
    const wrap = h('div', { class: 'zoom-grid', style: habitStyle(hb) });
    for (let i = 0; i < 7; i++) {
      wrap.appendChild(h('span', { class: 'wd', text: weekdayLetters()[(i + weekStart) % 7] }));
    }
    const first = unit === 'month' ? from.slice(0, 8) + '01' : from;
    const last = unit === 'month'
      ? from.slice(0, 8) + String(daysInMonth(yearOf(from), monthOf(from))).padStart(2, '0')
      : addDays(from, 6);
    const lead = weekdayIndex(first, weekStart);
    for (let i = 0; i < lead; i++) wrap.appendChild(h('span', { class: 'zoom-cell is-blank' }));

    const today = todayKey();
    for (let k = first; k <= last; k = addDays(k, 1)) {
      const future = k > today;
      const cell = h(future ? 'span' : 'button', {
        type: future ? null : 'button',
        class: 'zoom-cell',
        text: String(dayOf(k)),
        dataset: { k },
      });
      const paint = () => {
        const n = state.count(hb.id, k);
        const level = Math.min(n / hb.target, 1);
        cell.style.setProperty('--level', String(level));
        cell.classList.toggle('is-empty', n === 0);
        cell.classList.toggle('is-bright', level >= 0.55);
        cell.classList.toggle('is-today', k === today);
        if (!future) {
          cell.setAttribute('aria-label', longDate(k) + ' — ' + tickLabel(hb, n));
        }
      };
      paint();
      if (!future) {
        cell.addEventListener('click', () => {
          const n = state.count(hb.id, k);
          writeFor(hb)(k, n >= hb.target ? 0 : n + 1);
          paint();
          if (onTick) onTick();
        });
      }
      wrap.appendChild(cell);
    }
    sheet.appendChild(wrap);
    sheet.appendChild(h('div', { class: 'hr' }));
    sheet.appendChild(h('button', { type: 'button', class: 'btn', text: t('common.close'), onClick: close }));
  });
}

// -- onboarding --------------------------------------------------------------

export function onboarding() {
  const el = h('div', { class: 'onboard' });
  const input = h('input', {
    class: 'input', type: 'text', id: 'ob-name', autocomplete: 'nickname',
    placeholder: t('onboard.namePlaceholder'), maxLength: 32, value: state.get().username || '',
  });

  const start = () => {
    state.completeOnboarding(input.value);
    go('#/new');
  };

  el.appendChild(h('h1', {}, 'Habit', h('br'), 'Grid'));
  el.appendChild(h('p', { class: 'lede', text: t('app.tagline') }));

  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 'ob-name', text: t('onboard.question') }),
    input,
    h('p', { class: 'help', text: t('onboard.privacy') })));

  if (!isStandalone()) {
    const installRow = h('div', { class: 'field' });
    const btn = h('button', {
      type: 'button', class: 'btn', onClick: () => {
        if (canInstall()) {
          promptInstall().then(ok => { if (ok) installRow.remove(); });
        } else {
          toast(t('onboard.installManual'), { timeout: 6000 });
        }
      },
    }, icon('download'), t('onboard.install'));
    installRow.appendChild(btn);
    installRow.appendChild(h('p', { class: 'help', text: t('onboard.installWhy') }));
    el.appendChild(installRow);
  }

  el.appendChild(h('div', { class: 'hr' }));
  el.appendChild(h('button', { type: 'button', class: 'btn btn-primary', text: t('onboard.start'), onClick: start }));
  el.appendChild(h('p', { class: 'help', style: 'text-align:center;margin-top:14px',
    text: t('onboard.hasExport') }));

  setTimeout(() => input.focus(), 40);
  return { el, update() {} };
}

// -- home --------------------------------------------------------------------

export function home() {
  const el = h('div', { class: 'screen' });
  const cards = new Map();

  el.appendChild(topbar(t('app.name'), {
    sub: state.get().username ? t('home.greeting', { name: state.get().username }) : null,
    actions: [h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': t('common.settings'),
      onClick: () => go('#/settings'),
    }, icon('gear'))],
  }));

  const nudge = exportNudge();
  if (nudge) el.appendChild(nudge);

  const list = h('div', { class: 'cards' });
  el.appendChild(list);

  const habits = state.habits();
  if (!habits.length) {
    list.appendChild(h('div', { class: 'empty' },
      h('h2', { text: t('home.empty') }),
      h('p', { text: t('home.emptyBody') })));
  }

  habits.forEach((hb) => {
    const card = habitCard(hb, () => refreshCard(hb.id));
    cards.set(hb.id, card);
    list.appendChild(card.el);
  });

  enableReorder(list, cards);

  function refreshCard(id) {
    const card = cards.get(id);
    if (card) card.refresh();
  }

  el.appendChild(bottomBar('grid'));

  return {
    el,
    update(detail) {
      if (detail && detail.ticked && detail.habitId) refreshCard(detail.habitId);
      else cards.forEach(c => c.refresh());
    },
    destroy() { cards.forEach(c => c.destroy()); },
  };
}

function habitCard(hb, onTick) {
  const card = h('article', {
    class: 'card', style: habitStyle(hb), dataset: { id: hb.id },
  });
  const streak = streakLine(hb);
  const tick = tickButton(hb, onTick);

  const head = h('div', { class: 'card-head' },
    h('button', {
      type: 'button', class: 'card-title', style: 'display:flex;align-items:center;gap:11px',
      onClick: () => go('#/habit/' + hb.id),
    },
      glyph(hb),
      h('span', { style: 'min-width:0;flex:1' },
        h('span', { class: 'name', style: 'display:block', text: hb.name }),
        streak)),
    tick);

  const grid = gridFor(hb, { onTick });
  card.appendChild(head);
  card.appendChild(grid.el);

  return {
    el: card,
    refresh() {
      tick.paint();
      streak.paint();
      grid.refresh();
    },
    destroy() { grid.destroy(); },
  };
}

/** Long-press a card, then drag to reorder. */
function enableReorder(list, cards) {
  let dragging = null, timer = 0, startY = 0, moved = false;

  const cardOf = (node) => (node.closest ? node.closest('.card') : null);
  const blockScroll = (e) => e.preventDefault();

  list.addEventListener('pointerdown', (e) => {
    const head = e.target.closest ? e.target.closest('.card-head') : null;
    if (!head || e.target.closest('.tick')) return;
    const card = cardOf(e.target);
    if (!card) return;
    startY = e.clientY;
    moved = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      dragging = card;
      card.classList.add('is-dragging');
      // The gesture has not moved yet, so the browser has not committed to a
      // scroll; a non-passive blocker from here keeps the drag from panning
      // the page under it.
      document.addEventListener('touchmove', blockScroll, { passive: false });
      if (navigator.vibrate) { try { navigator.vibrate(14); } catch (err) { /* optional */ } }
    }, 400);
  });

  list.addEventListener('pointermove', (e) => {
    if (!dragging) {
      if (Math.abs(e.clientY - startY) > 8) clearTimeout(timer);
      return;
    }
    e.preventDefault();
    moved = true;
    const siblings = Array.from(list.children).filter(c => c !== dragging);
    for (const sib of siblings) {
      const r = sib.getBoundingClientRect();
      if (e.clientY > r.top && e.clientY < r.bottom) {
        const before = e.clientY < r.top + r.height / 2;
        list.insertBefore(dragging, before ? sib : sib.nextSibling);
        break;
      }
    }
  });

  const end = () => {
    clearTimeout(timer);
    if (!dragging) return;
    document.removeEventListener('touchmove', blockScroll, { passive: false });
    dragging.classList.remove('is-dragging');
    if (moved) {
      Array.from(list.children).forEach((node, i) => {
        if (node.dataset.id) state.moveHabit(node.dataset.id, i);
      });
      cards.forEach(c => c.refresh());
    }
    dragging = null;
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
  list.addEventListener('pointerleave', end);
}

function exportNudge() {
  const since = io.daysSinceExport();
  const habits = state.habits();
  if (!habits.length) return null;
  const oldest = habits.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const age = diffDays(oldest.createdAt, todayKey());
  if (since !== null && since < 30) return null;
  if (since === null && age < 30) return null;

  // Dismissing buys a week of quiet. A nag you cannot close is just noise.
  const snoozed = state.settings().nudgeSnoozedAt;
  if (snoozed && diffDays(snoozed, todayKey()) < 7) return null;

  const banner = h('div', { class: 'banner' },
    icon('download'),
    h('span', { style: 'flex:1', text: since === null
      ? t('nudge.never')
      : t('nudge.stale', { ago: plural(since, 'n.day') }) }),
    h('button', { type: 'button', text: t('nudge.action'), onClick: () => go('#/settings') }),
    h('button', {
      type: 'button', class: 'close', 'aria-label': t('nudge.dismiss'),
      onClick: () => {
        banner.remove();
        state.setSettings({ nudgeSnoozedAt: todayKey() });
      },
    }, icon('close')));
  return banner;
}

function bottomBar(active) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('home.view') },
    h('button', {
      type: 'button', 'aria-pressed': String(active === 'grid'),
      onClick: () => go('#/home'),
    }, icon('grid'), t('home.grid')),
    h('button', {
      type: 'button', 'aria-pressed': String(active === 'week'),
      onClick: () => go('#/week'),
    }, icon('week'), t('home.week')));

  const fab = h('button', {
    type: 'button', class: 'fab', 'aria-label': t('home.addHabit'),
    onClick: () => go('#/new'),
  }, icon('plus'));

  return h('div', {}, h('nav', { class: 'bottombar' }, seg), fab);
}

// -- week view ---------------------------------------------------------------

export function week() {
  const el = h('div', { class: 'screen' });
  const settings = state.settings();
  const today = todayKey();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));

  el.appendChild(topbar(t('week.title'), {
    sub: shortDate(days[0]) + ' – ' + shortDate(today),
    actions: [h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': t('common.settings'),
      onClick: () => go('#/settings'),
    }, icon('gear'))],
  }));

  const habits = state.habits();
  if (!habits.length) {
    el.appendChild(h('div', { class: 'empty' },
      h('h2', { text: t('home.empty') }),
      h('p', { text: t('week.empty') })));
    el.appendChild(bottomBar('week'));
    return { el, update() {} };
  }

  const head = h('div', { class: 'week-head' }, h('span'));
  days.forEach((k) => {
    head.appendChild(h('span', { class: k === today ? 'is-today' : '' },
      weekdayLetter(k), h('b', { text: String(dayOf(k)) })));
  });
  el.appendChild(head);

  const rows = h('div', {});
  const painters = [];

  habits.forEach((hb) => {
    const row = h('div', { class: 'week-row', style: habitStyle(hb) });
    row.appendChild(h('button', {
      type: 'button', class: 'week-name', onClick: () => go('#/habit/' + hb.id),
    }, glyph(hb), h('span', { class: 'n', text: hb.name, title: hb.name })));

    days.forEach((k) => {
      const cell = h('button', { type: 'button', class: 'week-cell' });
      const paint = () => {
        const n = state.count(hb.id, k);
        const level = Math.min(n / hb.target, 1);
        cell.style.setProperty('--level', String(level));
        cell.classList.toggle('is-empty', n === 0);
        cell.classList.toggle('is-bright', level >= 0.55);
        cell.classList.toggle('is-today', k === today);
        cell.textContent = n > 0 ? (hb.target > 1 ? String(n) : '') : '';
        if (n > 0 && hb.target === 1) cell.appendChild(icon('check', 'ico'));
        cell.setAttribute('aria-label',
          t('week.cellAria', { name: hb.name, date: longDate(k), status: tickLabel(hb, n) }));
      };
      cell.addEventListener('click', () => {
        const n = state.count(hb.id, k);
        writeFor(hb)(k, n >= hb.target ? 0 : n + 1);
        paint();
      });
      painters.push(paint);
      paint();
      row.appendChild(cell);
    });
    rows.appendChild(row);
  });

  el.appendChild(rows);
  el.appendChild(bottomBar('week'));

  return { el, update() { painters.forEach(p => p()); } };
}

// -- habit calendar ----------------------------------------------------------
// Tapping a habit opens a month at a size you can actually hit with a thumb.
// The contribution grid stays on the home card; the range that card uses is set
// in the editor.

export function detail(id) {
  const hb = state.habit(id);
  if (!hb) return notFound();

  const el = h('div', { class: 'screen', style: habitStyle(hb) });
  const today = todayKey();
  let cursor = today.slice(0, 7);          // the month on screen, YYYY-MM
  let focusKey = today;                    // roving tabindex within the month

  el.appendChild(topbar(hb.name, {
    back: () => go('#/home'),
    sub: hb.target > 1 ? t('cal.ticksPerDay', { n: hb.target }) : t('cal.oncePerDay'),
    actions: [h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': t('cal.settings'),
      onClick: () => go('#/edit/' + hb.id),
    }, icon('gear'))],
  }));

  const cal = h('div', { class: 'cal' });
  const statsBox = h('div', { class: 'stats' });
  const pinBox = h('div');
  const started = h('p', { class: 'help', style: 'margin-top:14px' });
  el.appendChild(cal);
  el.appendChild(statsBox);
  el.appendChild(pinBox);
  el.appendChild(started);

  /** Pinning shows this habit's grid on the hub's home screen. Only a few fit
   *  before they stop being readable.
   *
   *  At the limit the button stays live rather than going disabled: a dead
   *  button that swallows the tap tells you nothing, so this one answers with
   *  the reason and a way out — a sheet listing what is already pinned, so the
   *  swap can be made here instead of visiting the other habit to unpin it. */
  function paintPin() {
    pinBox.textContent = '';
    const pinned = !!hb.pinned;
    const full = !pinned && state.pinnedHabits().length >= state.PIN_LIMIT;

    const btn = h('button', {
      type: 'button',
      class: 'btn' + (pinned ? ' btn-primary' : ''),
      onClick: () => {
        if (full) { openPinSwap(); return; }
        state.setPinned(hb.id, !pinned);
        hb.pinned = !pinned;
        paintPin();
        toast(t(hb.pinned ? 'pin.added' : 'pin.removed', { name: hb.name }));
      },
    }, icon(pinned ? 'check' : 'grid'), t(pinned ? 'pin.remove' : 'pin.add'));

    pinBox.appendChild(btn);
    pinBox.appendChild(h('p', { class: 'help',
      text: full ? t('pin.fullHelp', { n: state.PIN_LIMIT })
        : pinned ? t('pin.onHelp') : t('pin.offHelp') }));
  }

  /** The hub is full. Offer to drop one of the habits already on it and take
   *  its place, rather than making the user go and unpin it themselves. */
  function openPinSwap() {
    openSheet((sheet, close) => {
      sheet.appendChild(h('h3', { text: t('pin.swapTitle') }));
      sheet.appendChild(h('p', { text: t('pin.swapBody', { n: state.PIN_LIMIT }) }));

      const rows = h('div', { class: 'rows' });
      state.pinnedHabits().forEach((other) => {
        rows.appendChild(h('button', {
          type: 'button', class: 'row', style: habitStyle(other),
          onClick: () => {
            close();
            state.setPinned(other.id, false);
            state.setPinned(hb.id, true);
            hb.pinned = true;
            paintPin();
            toast(t('pin.swapped', { removed: other.name, added: hb.name }));
          },
        }, glyph(other), h('span', { text: other.name }),
           h('span', { class: 'val', text: t('pin.replace') })));
      });
      sheet.appendChild(rows);
      sheet.appendChild(h('button', {
        type: 'button', class: 'btn', text: t('common.cancel'),
        style: 'margin-top:14px', onClick: close,
      }));
    });
  }

  const shiftMonth = (ym, n) => addMonths(ym + '-01', n).slice(0, 7);
  const write = writeFor(hb);

  function paintStats() {
    const s = statsFor(hb.id);
    statsBox.textContent = '';
    const tile = (v, k, small, wide) => h('div', { class: 'stat' },
      h('div', { class: 'v' + (wide ? ' word' : '') }, String(v),
        small ? h('small', { text: ' ' + small }) : null),
      h('div', { class: 'k', text: k }));
    const dayWord = (n) => t(n === 1 ? 'stat.unit.day' : 'stat.unit.days');

    statsBox.appendChild(tile(s.current, t('stat.current'), dayWord(s.current)));
    statsBox.appendChild(tile(s.longest, t('stat.longest'), dayWord(s.longest)));
    statsBox.appendChild(tile(s.completions, t('stat.completed')));
    statsBox.appendChild(tile(pct(s.rate), t('stat.rate')));

    // How long since anything at all was recorded — a plainer question than a
    // streak, and the one you actually want after a bad week.
    if (s.sinceTick === null) {
      statsBox.appendChild(tile(t('stat.lastTickNever'), t('stat.lastTick'), null, true));
    } else if (s.sinceTick === 0) {
      statsBox.appendChild(tile(t('stat.lastTickToday'), t('stat.lastTick'), null, true));
    } else {
      statsBox.appendChild(tile(s.sinceTick, t('stat.lastTick'), dayWord(s.sinceTick)));
    }
    statsBox.appendChild(tile(pct(s.recentRate), t('stat.recent', { n: s.recentDays })));

    if (hb.target > 1) {
      statsBox.appendChild(tile(s.ticks, t('stat.ticks')));
      statsBox.appendChild(tile(s.days, t('stat.tracked')));
    }
    if (s.bestWeekday) {
      statsBox.appendChild(tile(weekdayName(s.bestWeekday.index), t('stat.bestDay'),
        pct(s.bestWeekday.rate), true));
    }
    // An odd tile would leave a hole in the two-column grid.
    const tiles = statsBox.children;
    if (tiles.length % 2) tiles[tiles.length - 1].classList.add('span2');

    started.textContent = t('cal.started', { date: longDate(hb.createdAt) });
  }

  function buildCalendar(keepFocusOn) {
    cal.textContent = '';
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    const first = cursor + '-01';
    const length = daysInMonth(year, month);
    const weekStart = state.settings().weekStart;
    const atCurrentMonth = cursor === today.slice(0, 7);

    const prev = h('button', {
      type: 'button', class: 'cal-nav', 'aria-label': t('cal.prev'),
      onClick: () => { cursor = shiftMonth(cursor, -1); focusKey = null; buildCalendar('prev'); },
    }, icon('back'));
    const next = h('button', {
      type: 'button', class: 'cal-nav next', 'aria-label': t('cal.next'),
      disabled: atCurrentMonth,
      onClick: () => { cursor = shiftMonth(cursor, 1); focusKey = null; buildCalendar('next'); },
    }, icon('back'));

    const head = h('div', { class: 'cal-head' }, prev,
      h('div', { class: 'cal-title', text: monthYear(first) }), next);
    if (!atCurrentMonth) {
      head.appendChild(h('button', {
        type: 'button', class: 'cal-today', text: t('common.today'),
        onClick: () => { cursor = today.slice(0, 7); focusKey = today; buildCalendar(); },
      }));
    }
    cal.appendChild(head);

    const wd = h('div', { class: 'cal-wd', 'aria-hidden': 'true' });
    for (let i = 0; i < 7; i++) {
      wd.appendChild(h('span', { text: weekdayLetters()[(i + weekStart) % 7] }));
    }
    cal.appendChild(wd);

    const grid = h('div', { class: 'cal-grid', role: 'group',
      'aria-label': t('cal.monthAria', { name: hb.name, month: monthYear(first) }) });
    for (let i = 0, lead = weekdayIndex(first, weekStart); i < lead; i++) {
      grid.appendChild(h('span', { class: 'cal-cell is-blank', 'aria-hidden': 'true' }));
    }

    if (!focusKey || focusKey.slice(0, 7) !== cursor) {
      focusKey = atCurrentMonth ? today : first;
    }

    for (let d = 1; d <= length; d++) {
      const k = cursor + '-' + String(d).padStart(2, '0');
      grid.appendChild(dayCell(k, d));
    }
    cal.appendChild(grid);

    const done = countDone(first, cursor + '-' + String(length).padStart(2, '0'));
    const summary = h('div', { class: 'cal-month-total' },
      h('span', { text: t('common.ofDays', { done: done.done, days: done.days }) }));
    if (hb.target > 1) summary.appendChild(legend(hb));
    cal.appendChild(summary);

    enableSwipe(grid);

    if (keepFocusOn) {
      const wanted = keepFocusOn === 'next' ? next : prev;
      (wanted.disabled ? prev : wanted).focus();
    }
  }

  function countDone(from, to) {
    let days = 0, done = 0;
    for (let k = from; k <= to && k <= today; k = addDays(k, 1)) {
      days++;
      if (state.count(hb.id, k) >= hb.target) done++;
    }
    return { days, done };
  }

  function dayCell(k, d) {
    const future = k > today;
    const cell = h(future ? 'span' : 'button', {
      type: future ? null : 'button',
      class: 'cal-cell',
      dataset: { k },
    });
    const num = h('span', { class: 'd', text: String(d) });
    const count = h('span', { class: 'c' });
    cell.appendChild(num);
    if (hb.target > 1) cell.appendChild(count);

    const paint = () => {
      const n = state.count(hb.id, k);
      const level = Math.min(n / hb.target, 1);
      cell.style.setProperty('--level', String(level));
      cell.classList.toggle('is-empty', n === 0);
      cell.classList.toggle('is-bright', level >= 0.55);
      cell.classList.toggle('is-today', k === today);
      cell.classList.toggle('is-future', future);
      cell.classList.toggle('is-pre', !future && k < hb.createdAt && n === 0);
      if (hb.target > 1) count.textContent = n > 0 ? n + '/' + hb.target : '';
      if (!future) {
        cell.setAttribute('aria-label', longDate(k) + ' — ' + tickLabel(hb, n));
        cell.tabIndex = k === focusKey ? 0 : -1;
      }
    };
    paint();
    if (future) return cell;

    // Registered before the click handler on purpose: at the target, listeners
    // run in the order they were added, so the long-press guard has to be first
    // if it is going to swallow the click it produced.
    longPress(cell, () => openStepper(hb, k, cell, () => { refreshCells(); paintStats(); }));
    cell.addEventListener('click', () => {
      if (swipedAway) return;
      const n = state.count(hb.id, k);
      write(k, n >= hb.target ? 0 : n + 1);
      focusKey = k;
      refreshCells();
      paintStats();
    });
    cell.addEventListener('keydown', onCellKey);
    cell.repaint = paint;
    return cell;
  }

  function refreshCells() {
    cal.querySelectorAll('.cal-cell').forEach((c) => { if (c.repaint) c.repaint(); });
    const first = cursor + '-01';
    const length = daysInMonth(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)));
    const done = countDone(first, cursor + '-' + String(length).padStart(2, '0'));
    const total = cal.querySelector('.cal-month-total span');
    if (total) total.textContent = t('common.ofDays', { done: done.done, days: done.days });
  }

  function onCellKey(e) {
    const k = e.currentTarget.dataset.k;
    let next = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(k, -1); break;
      case 'ArrowRight': next = addDays(k, 1); break;
      case 'ArrowUp': next = addDays(k, -7); break;
      case 'ArrowDown': next = addDays(k, 7); break;
      default: return;
    }
    if (next > today) return;
    e.preventDefault();
    focusKey = next;
    if (next.slice(0, 7) !== cursor) {
      cursor = next.slice(0, 7);
      buildCalendar();
    } else {
      cal.querySelectorAll('.cal-cell[tabindex="0"]').forEach(c => { c.tabIndex = -1; });
    }
    const node = cal.querySelector('.cal-cell[data-k="' + next + '"]');
    if (node && node.tagName === 'BUTTON') { node.tabIndex = 0; node.focus(); }
  }

  // Swipe sideways to change month. A swipe that starts and ends on the same
  // cell would otherwise fire a click and tick that day.
  let swipedAway = false;
  function enableSwipe(grid) {
    let x0 = 0, y0 = 0, tracking = false;
    grid.addEventListener('pointerdown', (e) => {
      tracking = true; swipedAway = false; x0 = e.clientX; y0 = e.clientY;
    });
    grid.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swipedAway = true;
      if (dx > 0) { cursor = shiftMonth(cursor, -1); focusKey = null; buildCalendar(); }
      else if (cursor !== today.slice(0, 7)) { cursor = shiftMonth(cursor, 1); focusKey = null; buildCalendar(); }
      // Left set: the next pointerdown clears it. A timeout here would race the
      // click the browser is about to dispatch for this same gesture.
    });
    grid.addEventListener('pointercancel', () => { tracking = false; });
  }

  buildCalendar();
  paintStats();
  paintPin();

  return {
    el,
    update() { refreshCells(); paintStats(); paintPin(); },
  };
}

/** Shared long-press-to-open-a-stepper wiring. */
function longPress(node, fire) {
  let timer = 0, at = null, fired = false;
  const cancel = () => { clearTimeout(timer); at = null; };
  node.addEventListener('pointerdown', (e) => {
    at = { x: e.clientX, y: e.clientY };
    fired = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      at = null;
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* optional */ } }
      fire();
    }, 450);
  });
  node.addEventListener('pointermove', (e) => {
    if (!at) return;
    if (Math.abs(e.clientX - at.x) > 8 || Math.abs(e.clientY - at.y) > 8) cancel();
  });
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', (e) => {
    if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}

function legend(hb) {
  const box = h('div', { class: 'grid-legend' }, t('common.less'));
  [0, 0.25, 0.5, 0.75, 1].forEach((l) => {
    box.appendChild(h('i', { style: '--l:' + l, 'data-l': l === 0 ? '0' : '', 'aria-hidden': 'true' }));
  });
  box.appendChild(document.createTextNode(t('common.more')));
  return box;
}

function confirmDelete(hb) {
  const ticks = state.totalTicks(hb.id);
  const s = statsFor(hb.id);
  openSheet((sheet, close) => {
    sheet.appendChild(h('h3', { text: t('del.title', { name: hb.name }) }));
    sheet.appendChild(h('p', { text: t('del.body', {
      days: plural(s.completions, 'n.completedDay'),
      ticks: plural(ticks, 'n.tick'),
    }) }));
    sheet.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', text: t('del.keep'), onClick: close }),
      h('button', {
        type: 'button', class: 'btn btn-danger', text: t('common.delete'),
        onClick: () => {
          close();
          const snapshot = state.deleteHabit(hb.id);
          go('#/home');
          toast(t('del.done', { name: hb.name }), {
            action: t('common.undo'),
            timeout: 10000,
            onAction: () => { state.restore(snapshot); toast(t('del.undone', { name: hb.name })); },
          });
        },
      })));
  });
}

function notFound() {
  const el = h('div', { class: 'screen' },
    topbar(t('notFound.title'), { back: () => go('#/home') }),
    h('div', { class: 'empty' },
      h('h2', { text: t('notFound.head') }),
      h('p', { text: t('notFound.body') })));
  return { el, update() {} };
}

// -- add / edit --------------------------------------------------------------

export function editor(id) {
  const existing = id ? state.habit(id) : null;
  if (id && !existing) return notFound();

  const draft = existing ? {
    name: existing.name,
    icon: Object.assign({}, existing.icon),
    color: existing.color,
    target: existing.target,
    range: existing.range,
  } : {
    name: '',
    icon: { type: 'svg', value: 'check' },
    color: SWATCHES[0],
    target: 1,
    range: state.settings().defaultRange,
  };

  const el = h('div', { class: 'screen' });
  el.appendChild(topbar(t(existing ? 'edit.edit' : 'edit.new'), {
    back: () => history.back(),
  }));

  // live preview
  const preview = h('div', { class: 'preview-wrap' });
  let previewGrid = null;
  function paintPreview() {
    if (previewGrid) previewGrid.destroy();
    preview.style.setProperty('--habit', draft.color);
    preview.style.setProperty('--on-fill', inkOn(draft.color));
    preview.textContent = '';
    const fake = { id: '_preview', name: draft.name || t('edit.untitled'), icon: draft.icon, color: draft.color, target: draft.target };
    preview.appendChild(h('div', { class: 'card-head' },
      glyph(fake),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'name display', style: 'font-size:17px', text: fake.name }),
        h('div', { class: 'meta dim', style: 'font-size:12px' },
          draft.target > 1
            ? t('home.perDay', { n: draft.target }) + ' · ' + rangeLabel(draft.range)
            : rangeLabel(draft.range))),
      h('span', { class: 'tick' + (draft.target > 1 ? '' : ' is-done') },
        draft.target > 1 ? '0/' + draft.target : icon('check'))));
    previewGrid = sampleGrid(draft);
    preview.appendChild(previewGrid.el);
  }

  // name
  const nameInput = h('input', {
    class: 'input', type: 'text', id: 'f-name', maxLength: 40,
    placeholder: t('edit.namePlaceholder'), value: draft.name,
    onInput: (e) => { draft.name = e.target.value; paintPreview(); },
  });

  // icon picker
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const picker = h('div', { class: 'picker' });
  const setTab = (kind) => {
    tabs.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.kind === kind)));
    picker.textContent = '';
    if (kind === 'svg') buildSvgPicker();
    else if (kind === 'emoji') buildEmojiPicker();
    else buildLetterPicker();
  };
  ['svg', 'emoji', 'letter'].forEach((kind) => {
    tabs.appendChild(h('button', {
      type: 'button', role: 'tab', dataset: { kind },
      text: t(kind === 'svg' ? 'edit.tabIcons' : kind === 'emoji' ? 'edit.tabEmoji' : 'edit.tabLetter'),
      onClick: () => setTab(kind),
    }));
  });

  function pickIcon(next) {
    draft.icon = next;
    picker.querySelectorAll('.pick').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.value === next.value));
    });
    paintPreview();
  }

  function buildSvgPicker() {
    ICON_GROUPS.forEach((group) => {
      picker.appendChild(h('h4', { text: t('icons.' + group.name) }));
      const grid = h('div', { class: 'picker-grid' });
      group.icons.forEach((name) => {
        grid.appendChild(h('button', {
          type: 'button', class: 'pick', dataset: { value: name },
          'aria-label': name.replace(/-/g, ' '),
          'aria-pressed': String(draft.icon.type === 'svg' && draft.icon.value === name),
          onClick: () => pickIcon({ type: 'svg', value: name }),
        }, icon(name, '')));
      });
      picker.appendChild(grid);
    });
  }

  function buildEmojiPicker() {
    const grid = h('div', { class: 'picker-grid' });
    EMOJI.forEach((e) => {
      grid.appendChild(h('button', {
        type: 'button', class: 'pick', dataset: { value: e }, 'aria-label': t('edit.tabEmoji') + ' ' + e,
        'aria-pressed': String(draft.icon.type === 'emoji' && draft.icon.value === e),
        onClick: () => pickIcon({ type: 'emoji', value: e }),
      }, h('span', { class: 'emoji', text: e })));
    });
    picker.appendChild(grid);
  }

  function buildLetterPicker() {
    const value = draft.icon.type === 'letter'
      ? draft.icon.value
      : (draft.name || 'H').slice(0, 1).toUpperCase();
    const input = h('input', {
      class: 'input', type: 'text', value,
      style: 'text-align:center;font-family:var(--font-display);font-size:26px',
      'aria-label': t('edit.letter'),
      autocapitalize: 'characters',
      // Take the last character typed, not the first: with maxLength the field
      // fills up and every further keypress is silently dropped, so the default
      // letter could never be swapped without clearing the box first.
      onInput: (e) => {
        const typed = e.target.value || '';
        const v = (Array.from(typed).pop() || 'H').toUpperCase();
        e.target.value = v;
        draft.icon = { type: 'letter', value: v };
        paintPreview();
      },
      onFocus: (e) => e.target.select(),
    });
    picker.appendChild(input);
    picker.appendChild(h('p', { class: 'help', text: t('edit.letterHelp') }));
    if (draft.icon.type !== 'letter') pickIcon({ type: 'letter', value });
  }

  // colour
  const swatches = h('div', { class: 'swatches' });
  SWATCHES.forEach((c) => {
    swatches.appendChild(h('button', {
      type: 'button', class: 'swatch', style: '--c:' + c, dataset: { c },
      'aria-label': t('edit.colourAria', { hex: c }), 'aria-pressed': String(c === draft.color),
      onClick: () => setColor(c),
    }));
  });
  const custom = h('input', {
    type: 'color', class: 'swatch-custom', value: draft.color,
    'aria-label': t('edit.customColour'),
    onInput: (e) => setColor(e.target.value, true),
  });
  swatches.appendChild(custom);

  function setColor(c, fromCustom) {
    draft.color = c;
    swatches.querySelectorAll('.swatch').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.c === c)));
    if (!fromCustom) custom.value = c;
    paintPreview();
  }

  // target
  const targetNote = h('p', { class: 'help' });
  function paintTargetNote() {
    if (draft.target === 1) {
      targetNote.textContent = t('edit.targetOne');
    } else {
      targetNote.textContent = t('edit.targetMany', {
        fraction: fraction(draft.target), n: draft.target,
      });
    }
    if (existing && draft.target !== existing.target) {
      targetNote.appendChild(h('br'));
      targetNote.appendChild(h('span', { style: 'color:var(--accent)',
        text: t('edit.targetChanged', { next: draft.target, prev: existing.target }) }));
    }
  }
  const targetBox = stepper(draft.target, 1, 20, (n) => {
    draft.target = n;
    paintTargetNote();
    paintPreview();
  }, t('edit.target').toLowerCase());
  paintTargetNote();

  // range
  const rangeSel = h('select', {
    class: 'input', id: 'f-range',
    onChange: (e) => { draft.range = e.target.value; paintPreview(); },
  });
  RANGES.forEach(r => rangeSel.appendChild(h('option', {
    value: r.id, text: rangeLabel(r.id), selected: r.id === draft.range,
  })));

  el.appendChild(preview);
  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 'f-name', text: t('edit.name') }), nameInput));
  el.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', text: t('edit.icon') }), tabs, picker));
  el.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', text: t('edit.colour') }), swatches));
  el.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', text: t('edit.target') }), targetBox, targetNote));
  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 'f-range', text: t('edit.range') }), rangeSel));

  const save = h('button', {
    type: 'button', class: 'btn btn-primary', text: t(existing ? 'common.save' : 'edit.add'),
    onClick: () => {
      if (!draft.name.trim()) { nameInput.focus(); toast(t('edit.needName')); return; }
      if (existing) {
        state.updateHabit(existing.id, draft);
        go('#/habit/' + existing.id);
      } else {
        const created = state.addHabit(draft);
        go('#/home');
        toast(t('edit.added', { name: created.name }));
      }
    },
  });
  el.appendChild(h('div', { class: 'btn-row', style: 'margin-top:6px' },
    h('button', { type: 'button', class: 'btn', text: t('common.cancel'), onClick: () => history.back() }),
    save));

  if (existing) {
    el.appendChild(h('div', { class: 'hr' }));
    el.appendChild(h('button', {
      type: 'button', class: 'btn btn-danger', onClick: () => confirmDelete(existing),
    }, icon('trash'), t('edit.deleteHabit')));
  }

  setTab(draft.icon.type);
  paintPreview();

  return { el, update() {}, destroy() { if (previewGrid) previewGrid.destroy(); } };
}

function fraction(n) {
  const known = [2, 3, 4, 5, 6, 8];
  return known.indexOf(n) >= 0 ? t('frac.' + n) : t('frac.other', { n });
}

/** A read-only grid over invented data, so the preview shows what the colour,
 *  target and range actually look like before you commit to them. */
function sampleGrid(draft) {
  const today = todayKey();
  const seed = draft.color.charCodeAt(1) + draft.target;
  const born = addDays(today, -4000);
  const grid = createGrid({
    range: draft.range,
    startKey: rangeStart(draft.range, born),
    createdAt: born,
    target: draft.target,
    weekStart: state.settings().weekStart,
    interactive: false,
    read: (k) => {
      const n = (k.charCodeAt(8) * 31 + k.charCodeAt(9) * 7 + seed) % 11;
      if (n < 4) return 0;
      return Math.max(1, Math.round((n - 3) / 7 * draft.target));
    },
  });
  return grid;
}

// -- settings ----------------------------------------------------------------

export function settings() {
  const el = h('div', { class: 'screen' });
  const s = state.settings();

  el.appendChild(topbar(t('common.settings'), { back: () => go('#/home') }));

  const nameInput = h('input', {
    class: 'input', type: 'text', id: 's-name', maxLength: 32,
    value: state.get().username, placeholder: t('onboard.namePlaceholder'),
    onChange: (e) => { state.setUsername(e.target.value); },
  });
  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 's-name', text: t('edit.name') }), nameInput,
    h('p', { class: 'help', text: t('set.nameHelp') })));

  el.appendChild(h('div', { class: 'section-title', text: t('set.appearance') }));

  const pref = themePrefs();
  const themeOptions = THEMES.map(x => ({
    value: x.id,
    label: x.mode === 'light' ? t('set.themeLight', { name: themeLabel(x.id) }) : themeLabel(x.id),
  }));
  themeOptions.push({ value: 'auto', label: t('set.themeAuto') });

  const appearance = h('div', { class: 'rows' },
    selectRow(t('set.language'), s.lang || detectLang(),
      LANGUAGES.map(l => ({ value: l.id, label: l.label })), (v) => {
        state.setSettings({ lang: v });
        setLang(v);
        rerender();
      }),
    selectRow(t('set.theme'), pref.theme, themeOptions, (v) => {
      setThemePrefs({ theme: v });
      rerender();
    }));

  if (pref.theme === 'auto') {
    appearance.appendChild(selectRow(t('set.whenDark'), pref.autoDark,
      THEMES.filter(x => x.mode === 'dark').map(x => ({ value: x.id, label: themeLabel(x.id) })),
      (v) => { setThemePrefs({ autoDark: v }); }));
    appearance.appendChild(selectRow(t('set.whenLight'), pref.autoLight,
      THEMES.filter(x => x.mode === 'light').map(x => ({ value: x.id, label: themeLabel(x.id) })),
      (v) => { setThemePrefs({ autoLight: v }); }));
  }
  appearance.appendChild(accentRow());
  appearance.appendChild(exclusiveRow());
  el.appendChild(appearance);
  el.appendChild(h('p', { class: 'help',
    text: t(pref.theme === 'auto' ? 'set.autoHelp' : 'set.accentHelp') }));
  el.appendChild(h('p', { class: 'help',
    text: t(themeIsExclusive() ? 'set.exclusiveOnHelp' : 'set.exclusiveOffHelp') }));

  el.appendChild(h('div', { class: 'section-title', text: t('set.gridSection') }));
  el.appendChild(h('div', { class: 'rows' },
    selectRow(t('set.weekStart'), s.weekStart, [
      { value: '1', label: t('set.monday') }, { value: '0', label: t('set.sunday') },
    ], (v) => { state.setSettings({ weekStart: Number(v) }); rerender(); }),
    selectRow(t('set.defaultRange'), s.defaultRange,
      RANGES.map(r => ({ value: r.id, label: rangeLabel(r.id) })),
      (v) => state.setSettings({ defaultRange: v })),
    selectRow(t('set.cellUnit'), s.density, [
      { value: 'auto', label: t('set.unitAuto') },
      { value: 'day', label: t('set.unitDay') },
      { value: 'week', label: t('set.unitWeek') },
      { value: 'month', label: t('set.unitMonth') },
    ], (v) => { state.setSettings({ density: v }); rerender(); })));
  el.appendChild(h('p', { class: 'help', text: t('set.gridHelp') }));

  // -- data
  el.appendChild(h('div', { class: 'section-title', text: t('set.dataSection') }));

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', style: 'display:none',
    onChange: (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) startImport(file);
    },
  });

  const rows = h('div', { class: 'rows' },
    h('button', {
      type: 'button', class: 'row', onClick: () => {
        if (io.download()) toast(t('set.exported', { file: io.filename() }));
        else toast(t('set.exportBlocked'), { error: true });
        rerender();
      },
    }, icon('download'), t('set.export'), h('span', { class: 'val', text: '.json' })),
    h('button', {
      type: 'button', class: 'row', onClick: () => {
        io.copyToClipboard()
          .then(ok => toast(t(ok ? 'set.copied' : 'set.copyFailed'), { error: !ok }))
          .catch(() => toast(t('set.copyBlocked'), { error: true }));
      },
    }, icon('edit'), t('set.copy'), h('span', { class: 'val', text: t('set.copyNote') })),
    h('button', {
      type: 'button', class: 'row', onClick: () => fileInput.click(),
    }, icon('upload'), t('set.import')));

  if (io.hasBackup()) {
    rows.appendChild(h('button', {
      type: 'button', class: 'row', onClick: () => {
        openSheet((sheet, close) => {
          sheet.appendChild(h('h3', { text: t('set.restoreTitle') }));
          sheet.appendChild(h('p', { text: t('set.restoreBody') }));
          sheet.appendChild(h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn', text: t('common.cancel'), onClick: close }),
            h('button', {
              type: 'button', class: 'btn btn-primary', text: t('common.restore'),
              onClick: () => { close(); io.restoreBackup(); toast(t('set.restored')); rerender(); },
            })));
        });
      },
    }, icon('back'), t('set.restoreBackup'), h('span', { class: 'val', text: t('set.restoreNote') })));
  }
  el.appendChild(rows);
  el.appendChild(fileInput);

  const used = storage.usage();
  const last = s.lastExport;
  el.appendChild(h('p', { class: 'help', text: t('set.storageLine', {
    habits: plural(state.habits().length, 'n.habit'),
    size: used > 1024 ? Math.round(used / 1024) + ' KB' : used + ' B',
    export: last ? t('set.lastExport', { date: longDate(last) }) : t('set.neverExported'),
  }) }));

  // -- app
  el.appendChild(h('div', { class: 'section-title', text: t('set.appSection') }));
  const appRows = h('div', { class: 'rows' });
  if (!isStandalone()) {
    appRows.appendChild(h('button', {
      type: 'button', class: 'row', onClick: () => {
        if (canInstall()) promptInstall().then(ok => { if (ok) rerender(); });
        else toast(t('onboard.installManual'), { timeout: 6000 });
      },
    }, icon('download'), t('onboard.install')));
  }
  appRows.appendChild(h('button', {
    type: 'button', class: 'row', onClick: () => {
      openSheet((sheet, close) => {
        sheet.appendChild(h('h3', { text: t('set.aboutTitle') }));
        sheet.appendChild(h('p', { text: t('set.aboutBody1') }));
        sheet.appendChild(h('p', { text: t('set.aboutBody2') }));
        sheet.appendChild(h('button', { type: 'button', class: 'btn', text: t('common.close'), onClick: close }));
      });
    },
  }, icon('book'), t('set.about')));

  appRows.appendChild(h('button', {
    type: 'button', class: 'row', style: 'color:var(--danger)',
    onClick: () => {
      openSheet((sheet, close) => {
        sheet.appendChild(h('h3', { text: t('set.deleteAllTitle') }));
        sheet.appendChild(h('p', { text: t('set.deleteAllBody') }));
        sheet.appendChild(h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', text: t('common.cancel'), onClick: close }),
          h('button', {
            type: 'button', class: 'btn btn-danger', text: t('set.deleteAll'),
            onClick: () => { close(); state.reset(); go('#/welcome'); },
          })));
      });
    },
  }, icon('trash'), t('set.deleteAll')));
  el.appendChild(appRows);

  el.appendChild(h('p', { class: 'help', style: 'text-align:center;margin-top:26px',
    text: t('set.footer') }));

  function startImport(file) {
    io.readFile(file)
      .then((raw) => {
        const result = io.validate(raw);
        if (!result.ok) {
          openSheet((sheet, close) => {
            sheet.appendChild(h('h3', { text: t('imp.refused') }));
            sheet.appendChild(h('p', { text: t('imp.refusedBody', { errors: result.errors.join(' ') }) }));
            sheet.appendChild(h('button', { type: 'button', class: 'btn', text: t('common.close'), onClick: close }));
          });
          return;
        }
        openSheet((sheet, close) => {
          const c = result.counts;
          sheet.appendChild(h('h3', { text: t('imp.title', { habits: plural(c.habits, 'n.habit') }) }));
          sheet.appendChild(h('p', { text: t('imp.body', {
            habits: plural(c.habits, 'n.habit'),
            days: plural(c.days, 'n.day'),
            ticks: plural(c.ticks, 'n.tick'),
          }) + (result.warnings.length ? ' ' + result.warnings.join(' ') : '') }));
          sheet.appendChild(h('div', { class: 'rows' },
            h('button', {
              type: 'button', class: 'row', onClick: () => {
                close(); io.merge(result.data); toast(t('imp.merged')); rerender();
              },
            }, icon('plus'), t('imp.merge'),
              h('span', { class: 'val', text: t('imp.mergeNote') })),
            h('button', {
              type: 'button', class: 'row', onClick: () => {
                close(); io.replaceAll(result.data); toast(t('imp.replaced')); rerender();
              },
            }, icon('upload'), t('imp.replace'),
              h('span', { class: 'val', text: t('imp.replaceNote') }))));
          sheet.appendChild(h('div', { style: 'height:12px' }));
          sheet.appendChild(h('button', { type: 'button', class: 'btn', text: t('common.cancel'), onClick: close }));
        });
      })
      .catch(err => toast(err.message, { error: true }));
  }

  return { el, update() {} };
}

function accentRow() {
  const custom = themePrefs().accent;
  const swatch = h('input', {
    type: 'color', class: 'accent-swatch', 'aria-label': t('set.accent'),
    value: custom || themeAccent(),
    onInput: (e) => {
      setThemePrefs({ accent: e.target.value });
      reset.disabled = false;
    },
  });
  const reset = h('button', {
    type: 'button', class: 'accent-reset', text: t('common.reset'),
    disabled: !custom,
    onClick: () => {
      setThemePrefs({ accent: null });
      swatch.value = themeAccent();
      reset.disabled = true;
    },
  });
  return h('div', { class: 'row' },
    h('span', { text: t('set.accent') }),
    h('div', { class: 'accent-row' }, swatch, reset));
}

/** Opting out of the shared appearance. Switching it on keeps whatever is on
 *  screen — it stops the sync, it does not change the colours. */
function exclusiveRow() {
  const sw = h('button', {
    type: 'button', class: 'switch', role: 'switch',
    'aria-checked': String(themeIsExclusive()),
    'aria-label': t('set.exclusive'),
    onClick: () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      setThemeExclusive(next);
      sw.setAttribute('aria-checked', String(next));
      rerender();
    },
  });
  return h('div', { class: 'row' }, h('span', { text: t('set.exclusive') }), sw);
}

function selectRow(label, value, options, onChange) {
  const sel = h('select', { 'aria-label': label, onChange: (e) => onChange(e.target.value) });
  options.forEach(o => sel.appendChild(h('option', {
    value: o.value, text: o.label, selected: String(o.value) === String(value),
  })));
  return h('div', { class: 'row' }, h('span', { text: label }), sel);
}

/** Which theme is actually on screen — resolves 'auto' against the OS. */
export function resolvedTheme() {
  return Theme.resolved(APP_ID).id;
}

export function applyLang() {
  setLang(state.settings().lang || detectLang());
}

/** The shared engine owns the tokens; this just asks it to paint. Preferences
 *  are read from the shared key (or this app's private one when it is set to
 *  exclusive), never from the habit store — see themePrefs below. */
export function applyTheme() {
  Theme.apply(APP_ID);
}

/** The accent this theme would use with no override — for the reset swatch. */
export function themeAccent() {
  return Theme.resolved(APP_ID).core.accent;
}

/** Appearance now lives outside the habit store so every app can see it. The
 *  store still carries a mirror of it, which is what an export/import restores
 *  — see syncThemeToStore. */
export function themePrefs() {
  return Theme.get(APP_ID);
}

export function setThemePrefs(patch) {
  Theme.set(APP_ID, patch);
  Theme.apply(APP_ID);
  syncThemeToStore();
}

export function themeIsExclusive() {
  return Theme.isExclusive(APP_ID);
}

export function setThemeExclusive(on) {
  Theme.setExclusive(APP_ID, on);
  Theme.apply(APP_ID);
  syncThemeToStore();
}

/** Keeps settings.theme/accent in step with the shared preference, so an
 *  exported backup still carries the appearance the user was looking at. */
export function syncThemeToStore() {
  const pref = Theme.get(APP_ID);
  const s = state.settings();
  if (s.theme === pref.theme && s.accent === pref.accent
      && s.autoDark === pref.autoDark && s.autoLight === pref.autoLight) return;
  state.setSettings({
    theme: pref.theme,
    accent: pref.accent,
    autoDark: pref.autoDark,
    autoLight: pref.autoLight,
  });
}

/** The reverse: an import or a restore carries an appearance in its payload,
 *  and adopting it should move the shared preference too. */
export function adoptThemeFromStore() {
  const s = state.settings();
  const patch = {};
  if (s.theme === 'auto' || Theme.resolveId(s.theme)) {
    patch.theme = s.theme === 'auto' ? 'auto' : Theme.resolveId(s.theme);
  }
  if (typeof s.accent === 'string' || s.accent === null) patch.accent = s.accent;
  if (Theme.resolveId(s.autoDark)) patch.autoDark = Theme.resolveId(s.autoDark);
  if (Theme.resolveId(s.autoLight)) patch.autoLight = Theme.resolveId(s.autoLight);
  Theme.set(APP_ID, patch);
  Theme.apply(APP_ID);
}

/** Repaint when another app on this origin changes the shared theme. */
export function watchTheme(onChange) {
  return Theme.watch(APP_ID, () => {
    syncThemeToStore();
    if (onChange) onChange();
  });
}

let rerenderHook = () => {};
export function setRerender(fn) { rerenderHook = fn; }
function rerender() { rerenderHook(); }
