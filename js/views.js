// views.js — every screen, plus the sheets and toasts they share.
//
// A view returns { el, update(detail) }. The router swaps views; update() lets
// a view respond to a tick without a full rebuild, so grid scroll positions
// survive.

import * as state from './state.js';
import * as storage from './storage.js';
import * as io from './io.js';
import { statsFor } from './stats.js';
import { createGrid, densityFor } from './grid.js';
import {
  todayKey, addDays, rangeStart, rangeLabel, RANGES, longDate, shortDate,
  weekdayLetter, dayOf, monthOf, yearOf, daysInMonth, weekdayIndex,
  MONTHS_LONG, WEEKDAY_LETTERS, diffDays,
} from './dates.js';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

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
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

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
    type: 'button', class: 'faint', 'aria-label': 'Dismiss', onClick: close,
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
  const dec = h('button', { type: 'button', 'aria-label': 'Decrease ' + (label || 'value') }, icon('minus'));
  const inc = h('button', { type: 'button', 'aria-label': 'Increase ' + (label || 'value') }, icon('plus'));
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
      type: 'button', class: 'iconbtn', 'aria-label': 'Back',
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
  if (hb.target > 1) return count + '/' + hb.target;
  return count > 0 ? 'done' : 'not done';
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
    btn.setAttribute('aria-label', 'Today, ' + hb.name + ' — ' + tickLabel(hb, n) + '. Tap to tick.');
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
      line.appendChild(document.createTextNode(s.current === 1 ? ' day' : ' days'));
    } else if (s.completions > 0) {
      line.appendChild(document.createTextNode('No streak · ' + plural(s.completions, 'day') + ' total'));
    } else {
      line.appendChild(document.createTextNode('Not started'));
    }
    if (hb.target > 1) {
      line.appendChild(document.createTextNode(' · ' + hb.target + '× daily'));
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
    }, 'count for ' + longDate(dateKey));
    pop.appendChild(box);
  });
}

/** Aggregate cells cannot be ticked — you cannot do "March". Tapping one opens
 *  the period at day density instead. */
function openZoom(hb, from, to, unit, onTick) {
  openSheet((sheet, close) => {
    const title = unit === 'month'
      ? MONTHS_LONG[monthOf(from) - 1] + ' ' + yearOf(from)
      : 'Week of ' + longDate(from);
    sheet.appendChild(h('h3', { class: 'display', text: title }));
    sheet.appendChild(h('p', { text: 'Tap a day to tick it.' }));

    const weekStart = state.settings().weekStart;
    const wrap = h('div', { class: 'zoom-grid', style: '--habit:' + hb.color });
    for (let i = 0; i < 7; i++) {
      wrap.appendChild(h('span', { class: 'wd', text: WEEKDAY_LETTERS[(i + weekStart) % 7] }));
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
        cell.style.setProperty('--level', String(Math.min(n / hb.target, 1)));
        cell.classList.toggle('is-empty', n === 0);
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
    sheet.appendChild(h('button', { type: 'button', class: 'btn', text: 'Done', onClick: close }));
  });
}

// -- onboarding --------------------------------------------------------------

export function onboarding() {
  const el = h('div', { class: 'onboard' });
  const input = h('input', {
    class: 'input', type: 'text', id: 'ob-name', autocomplete: 'nickname',
    placeholder: 'Your name', maxLength: 32, value: state.get().username || '',
  });

  const start = () => {
    state.completeOnboarding(input.value);
    go('#/new');
  };

  el.appendChild(h('h1', {}, 'Habit', h('br'), 'Grid'));
  el.appendChild(h('p', { class: 'lede' },
    'A decade of small marks, and nothing else. No accounts, no reminders, no server.'));

  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 'ob-name', text: 'What should the app call you?' }),
    input,
    h('p', { class: 'help' },
      'Everything you record lives in this browser on this device, and nowhere else. '
      + 'There is no account to lose and no server to leak it. That also means it is '
      + 'yours to look after: export a copy now and then.')));

  if (!isStandalone()) {
    const installRow = h('div', { class: 'field' });
    const btn = h('button', {
      type: 'button', class: 'btn', onClick: () => {
        if (canInstall()) {
          promptInstall().then(ok => { if (ok) installRow.remove(); });
        } else {
          toast('Open your browser menu and choose "Add to Home screen".', { timeout: 6000 });
        }
      },
    }, icon('download'), 'Add to Home screen');
    installRow.appendChild(btn);
    installRow.appendChild(h('p', { class: 'help' },
      'Installing keeps the app offline and stops the browser clearing your data '
      + 'after a spell without a visit. Worth the ten seconds.'));
    el.appendChild(installRow);
  }

  el.appendChild(h('div', { class: 'hr' }));
  el.appendChild(h('button', { type: 'button', class: 'btn btn-primary', text: 'Start', onClick: start }));
  el.appendChild(h('p', { class: 'help', style: 'text-align:center;margin-top:14px' },
    'Already have an export? Start, then use Settings → Import.'));

  setTimeout(() => input.focus(), 40);
  return { el, update() {} };
}

// -- home --------------------------------------------------------------------

export function home() {
  const el = h('div', { class: 'screen' });
  const cards = new Map();

  el.appendChild(topbar('Habit Grid', {
    sub: state.get().username ? 'Hello, ' + state.get().username : null,
    actions: [h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': 'Settings',
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
      h('h2', { text: 'Nothing yet' }),
      h('p', { text: 'Add a habit and start filling the grid. One square a day.' })));
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
    class: 'card', style: '--habit:' + hb.color, dataset: { id: hb.id },
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

  const cardOf = (t) => (t.closest ? t.closest('.card') : null);
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
  return h('div', { class: 'banner' },
    icon('download'),
    h('span', { style: 'flex:1', text: since === null
      ? 'You have never exported a copy of this.'
      : 'Last export was ' + plural(since, 'day') + ' ago.' }),
    h('button', { type: 'button', text: 'Export', onClick: () => go('#/settings') }));
}

function bottomBar(active) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
    h('button', {
      type: 'button', 'aria-pressed': String(active === 'grid'),
      onClick: () => go('#/home'),
    }, icon('grid'), 'Grid'),
    h('button', {
      type: 'button', 'aria-pressed': String(active === 'week'),
      onClick: () => go('#/week'),
    }, icon('week'), 'Week'));

  const fab = h('button', {
    type: 'button', class: 'fab', 'aria-label': 'Add a habit',
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

  el.appendChild(topbar('Last 7 days', {
    sub: shortDate(days[0]) + ' – ' + shortDate(today),
    actions: [h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': 'Settings',
      onClick: () => go('#/settings'),
    }, icon('gear'))],
  }));

  const habits = state.habits();
  if (!habits.length) {
    el.appendChild(h('div', { class: 'empty' },
      h('h2', { text: 'Nothing yet' }),
      h('p', { text: 'Add a habit to see the week.' })));
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
    const row = h('div', { class: 'week-row', style: '--habit:' + hb.color });
    row.appendChild(h('button', {
      type: 'button', class: 'week-name', onClick: () => go('#/habit/' + hb.id),
    }, glyph(hb), h('span', { class: 'n', text: hb.name, title: hb.name })));

    days.forEach((k) => {
      const cell = h('button', { type: 'button', class: 'week-cell' });
      const paint = () => {
        const n = state.count(hb.id, k);
        cell.style.setProperty('--level', String(Math.min(n / hb.target, 1)));
        cell.classList.toggle('is-empty', n === 0);
        cell.classList.toggle('is-today', k === today);
        cell.textContent = n > 0 ? (hb.target > 1 ? String(n) : '') : '';
        if (n > 0 && hb.target === 1) cell.appendChild(icon('check', 'ico'));
        cell.setAttribute('aria-label', hb.name + ', ' + longDate(k) + ' — ' + tickLabel(hb, n));
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

// -- habit detail ------------------------------------------------------------

export function detail(id) {
  const hb = state.habit(id);
  if (!hb) return notFound();

  const el = h('div', { class: 'screen', style: '--habit:' + hb.color });
  let range = hb.range;

  el.appendChild(topbar(hb.name, {
    back: () => go('#/home'),
    sub: hb.target > 1 ? hb.target + ' ticks a day' : 'Once a day',
    actions: [h('button', {
      type: 'button', class: 'iconbtn', 'aria-label': 'Edit habit',
      onClick: () => go('#/edit/' + hb.id),
    }, icon('edit'))],
  }));

  const gridBox = h('div', { class: 'preview-wrap' });
  let grid = null;

  const statsBox = h('div', { class: 'stats' });

  function paintStats() {
    const s = statsFor(hb.id);
    statsBox.textContent = '';
    const tile = (v, k, small) => h('div', { class: 'stat' },
      h('div', { class: 'v' }, String(v), small ? h('small', { text: ' ' + small }) : null),
      h('div', { class: 'k', text: k }));
    statsBox.appendChild(tile(s.current, 'Current streak', s.current === 1 ? 'day' : 'days'));
    statsBox.appendChild(tile(s.longest, 'Longest streak', s.longest === 1 ? 'day' : 'days'));
    statsBox.appendChild(tile(s.completions, 'Days completed'));
    statsBox.appendChild(tile(pct(s.rate), 'Completion rate'));
    if (hb.target > 1) {
      statsBox.appendChild(tile(s.ticks, 'Total ticks'));
      statsBox.appendChild(tile(s.days, 'Days tracked'));
    }
  }

  const unitNote = h('p', { class: 'help', style: 'margin-top:-6px' });

  function buildGrid() {
    if (grid) grid.destroy();
    gridBox.textContent = '';
    grid = gridFor(hb, { range, onTick: () => { paintStats(); } });
    gridBox.appendChild(grid.el);
    gridBox.appendChild(legend(hb));

    const unit = densityFor(range, hb.createdAt, todayKey(), state.settings().density).unit;
    unitNote.textContent = unit === 'day' ? ''
      : 'At this range each cell is a ' + unit + '. Tap one to open it at day level.';
    unitNote.style.display = unit === 'day' ? 'none' : '';
  }

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Grid range' });
  function centreChip() {
    const active = chips.querySelector('.chip[aria-pressed="true"]');
    if (active) chips.scrollLeft = active.offsetLeft - chips.clientWidth / 2 + active.offsetWidth / 2;
  }
  RANGES.forEach((r) => {
    chips.appendChild(h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(r.id === range),
      text: r.label,
      onClick: () => {
        range = r.id;
        state.updateHabit(hb.id, { range });
        chips.querySelectorAll('.chip').forEach((c, i) => {
          c.setAttribute('aria-pressed', String(RANGES[i].id === range));
        });
        buildGrid();
        centreChip();
      },
    }));
  });

  el.appendChild(chips);
  el.appendChild(h('div', { style: 'height:12px' }));
  el.appendChild(gridBox);
  el.appendChild(statsBox);
  el.appendChild(unitNote);
  setTimeout(centreChip, 0);

  el.appendChild(h('div', { class: 'section-title', text: 'Habit' }));
  el.appendChild(h('div', { class: 'rows' },
    h('button', { type: 'button', class: 'row', onClick: () => go('#/edit/' + hb.id) },
      icon('edit'), 'Edit', h('span', { class: 'val', text: 'name, icon, colour, target' })),
    h('button', {
      type: 'button', class: 'row', style: 'color:var(--danger)',
      onClick: () => confirmDelete(hb),
    }, icon('trash'), 'Delete habit')));

  el.appendChild(h('p', { class: 'help', style: 'margin-top:14px' },
    'Started ' + longDate(hb.createdAt) + '.'));

  buildGrid();
  paintStats();

  return {
    el,
    update() { if (grid) grid.refresh(); paintStats(); },
    destroy() { if (grid) grid.destroy(); },
  };
}

function legend(hb) {
  const box = h('div', { class: 'grid-legend' }, 'Less');
  [0, 0.25, 0.5, 0.75, 1].forEach((l) => {
    box.appendChild(h('i', { style: '--l:' + l, 'data-l': l === 0 ? '0' : '', 'aria-hidden': 'true' }));
  });
  box.appendChild(document.createTextNode('More'));
  return box;
}

function confirmDelete(hb) {
  const ticks = state.totalTicks(hb.id);
  const s = statsFor(hb.id);
  openSheet((sheet, close) => {
    sheet.appendChild(h('h3', { text: 'Delete ' + hb.name + '?' }));
    sheet.appendChild(h('p', {},
      'This removes ' + plural(s.completions, 'completed day') + ' and '
      + plural(ticks, 'tick') + '. You get ten seconds to undo, then it is gone.'));
    sheet.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', text: 'Keep it', onClick: close }),
      h('button', {
        type: 'button', class: 'btn btn-danger', text: 'Delete',
        onClick: () => {
          close();
          const snapshot = state.deleteHabit(hb.id);
          go('#/home');
          toast('Deleted ' + hb.name + '.', {
            action: 'Undo',
            timeout: 10000,
            onAction: () => { state.restore(snapshot); toast(hb.name + ' is back.'); },
          });
        },
      })));
  });
}

function notFound() {
  const el = h('div', { class: 'screen' },
    topbar('Not found', { back: () => go('#/home') }),
    h('div', { class: 'empty' },
      h('h2', { text: 'That habit is gone' }),
      h('p', { text: 'It may have been deleted on another tab.' })));
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
  el.appendChild(topbar(existing ? 'Edit habit' : 'New habit', {
    back: () => history.back(),
  }));

  // live preview
  const preview = h('div', { class: 'preview-wrap' });
  let previewGrid = null;
  function paintPreview() {
    if (previewGrid) previewGrid.destroy();
    preview.style.setProperty('--habit', draft.color);
    preview.textContent = '';
    const fake = { id: '_preview', name: draft.name || 'Untitled', icon: draft.icon, color: draft.color, target: draft.target };
    preview.appendChild(h('div', { class: 'card-head' },
      glyph(fake),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'name display', style: 'font-size:17px', text: fake.name }),
        h('div', { class: 'meta dim', style: 'font-size:12px' },
          draft.target > 1 ? draft.target + '× daily · ' + rangeLabel(draft.range) : rangeLabel(draft.range))),
      h('span', { class: 'tick' + (draft.target > 1 ? '' : ' is-done') },
        draft.target > 1 ? '0/' + draft.target : icon('check'))));
    previewGrid = sampleGrid(draft);
    preview.appendChild(previewGrid.el);
  }

  // name
  const nameInput = h('input', {
    class: 'input', type: 'text', id: 'f-name', maxLength: 40,
    placeholder: 'Read, Run, Water…', value: draft.name,
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
      text: kind === 'svg' ? 'Icons' : kind === 'emoji' ? 'Emoji' : 'Letter',
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
      picker.appendChild(h('h4', { text: group.name }));
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
        type: 'button', class: 'pick', dataset: { value: e }, 'aria-label': 'Emoji ' + e,
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
      class: 'input', type: 'text', maxLength: 1, value,
      style: 'text-align:center;font-family:var(--font-display);font-size:26px',
      'aria-label': 'Letter',
      onInput: (e) => {
        const v = (e.target.value || 'H').slice(0, 1).toUpperCase();
        e.target.value = v;
        draft.icon = { type: 'letter', value: v };
        paintPreview();
      },
    });
    picker.appendChild(input);
    picker.appendChild(h('p', { class: 'help', text: 'Set in the display face, in the habit colour.' }));
    if (draft.icon.type !== 'letter') pickIcon({ type: 'letter', value });
  }

  // colour
  const swatches = h('div', { class: 'swatches' });
  SWATCHES.forEach((c) => {
    swatches.appendChild(h('button', {
      type: 'button', class: 'swatch', style: '--c:' + c, dataset: { c },
      'aria-label': 'Colour ' + c, 'aria-pressed': String(c === draft.color),
      onClick: () => setColor(c),
    }));
  });
  const custom = h('input', {
    type: 'color', class: 'swatch-custom', value: draft.color,
    'aria-label': 'Custom colour',
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
      targetNote.textContent = 'One tick fills the square.';
    } else {
      targetNote.textContent = 'Each tick fills a ' + fraction(draft.target)
        + ' of the square. A day counts toward a streak only at ' + draft.target + '.';
    }
    if (existing && draft.target !== existing.target) {
      targetNote.appendChild(h('br'));
      targetNote.appendChild(h('span', { style: 'color:var(--brass)' },
        'Changing the target re-scores your history: past days are measured '
        + 'against ' + draft.target + ' instead of ' + existing.target + '.'));
    }
  }
  const targetBox = stepper(draft.target, 1, 20, (n) => {
    draft.target = n;
    paintTargetNote();
    paintPreview();
  }, 'daily target');
  paintTargetNote();

  // range
  const rangeSel = h('select', {
    class: 'input', id: 'f-range',
    onChange: (e) => { draft.range = e.target.value; paintPreview(); },
  });
  RANGES.forEach(r => rangeSel.appendChild(h('option', {
    value: r.id, text: r.label, selected: r.id === draft.range,
  })));

  el.appendChild(preview);
  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 'f-name', text: 'Name' }), nameInput));
  el.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', text: 'Icon' }), tabs, picker));
  el.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', text: 'Colour' }), swatches));
  el.appendChild(h('div', { class: 'field' },
    h('span', { class: 'label', text: 'Daily target' }), targetBox, targetNote));
  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 'f-range', text: 'Grid range' }), rangeSel));

  const save = h('button', {
    type: 'button', class: 'btn btn-primary', text: existing ? 'Save' : 'Add habit',
    onClick: () => {
      if (!draft.name.trim()) { nameInput.focus(); toast('Give it a name first.'); return; }
      if (existing) {
        state.updateHabit(existing.id, draft);
        go('#/habit/' + existing.id);
      } else {
        const created = state.addHabit(draft);
        go('#/home');
        toast(created.name + ' added.');
      }
    },
  });
  el.appendChild(h('div', { class: 'btn-row', style: 'margin-top:6px' },
    h('button', { type: 'button', class: 'btn', text: 'Cancel', onClick: () => history.back() }),
    save));

  if (existing) {
    el.appendChild(h('div', { class: 'hr' }));
    el.appendChild(h('button', {
      type: 'button', class: 'btn btn-danger', onClick: () => confirmDelete(existing),
    }, icon('trash'), 'Delete habit'));
  }

  setTab(draft.icon.type);
  paintPreview();

  return { el, update() {}, destroy() { if (previewGrid) previewGrid.destroy(); } };
}

function fraction(n) {
  const names = { 2: 'half', 3: 'third', 4: 'quarter', 5: 'fifth', 6: 'sixth', 8: 'eighth' };
  return names[n] || ('1/' + n);
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

  el.appendChild(topbar('Settings', { back: () => go('#/home') }));

  const nameInput = h('input', {
    class: 'input', type: 'text', id: 's-name', maxLength: 32,
    value: state.get().username, placeholder: 'Your name',
    onChange: (e) => { state.setUsername(e.target.value); },
  });
  el.appendChild(h('div', { class: 'field' },
    h('label', { class: 'label', for: 's-name', text: 'Name' }), nameInput,
    h('p', { class: 'help', text: 'Stored on this device only. It appears on the home screen and in export filenames.' })));

  el.appendChild(h('div', { class: 'section-title', text: 'Display' }));
  el.appendChild(h('div', { class: 'rows' },
    selectRow('Week starts on', s.weekStart, [
      { value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' },
    ], (v) => { state.setSettings({ weekStart: Number(v) }); rerender(); }),
    selectRow('Theme', s.theme, [
      { value: 'dark', label: 'Ledger' }, { value: 'black', label: 'True black' },
    ], (v) => { state.setSettings({ theme: v }); applyTheme(); }),
    selectRow('Default range', s.defaultRange, RANGES.map(r => ({ value: r.id, label: r.label })),
      (v) => state.setSettings({ defaultRange: v })),
    selectRow('Cell unit', s.density, [
      { value: 'auto', label: 'Automatic' },
      { value: 'day', label: 'Always days' },
      { value: 'week', label: 'Always weeks' },
      { value: 'month', label: 'Always months' },
    ], (v) => { state.setSettings({ density: v }); rerender(); })));
  el.appendChild(h('p', { class: 'help', text: 'Automatic picks the cell unit that fits each range — days up to two years, then weeks, then months.' }));

  // -- data
  el.appendChild(h('div', { class: 'section-title', text: 'Your data' }));

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
        if (io.download()) toast('Exported ' + io.filename());
        else toast('This browser blocked the download. Try Copy instead.', { error: true });
        rerender();
      },
    }, icon('download'), 'Export a copy', h('span', { class: 'val', text: '.json' })),
    h('button', {
      type: 'button', class: 'row', onClick: () => {
        io.copyToClipboard()
          .then(ok => toast(ok ? 'Copied to the clipboard.' : 'Could not copy.', { error: !ok }))
          .catch(() => toast('This browser would not let the app copy.', { error: true }));
      },
    }, icon('edit'), 'Copy to clipboard', h('span', { class: 'val', text: 'fallback' })),
    h('button', {
      type: 'button', class: 'row', onClick: () => fileInput.click(),
    }, icon('upload'), 'Import a file'));

  if (io.hasBackup()) {
    rows.appendChild(h('button', {
      type: 'button', class: 'row', onClick: () => {
        openSheet((sheet, close) => {
          sheet.appendChild(h('h3', { text: 'Restore the pre-import backup?' }));
          sheet.appendChild(h('p', { text: 'This replaces everything currently in the app with the snapshot taken just before your last import.' }));
          sheet.appendChild(h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn', text: 'Cancel', onClick: close }),
            h('button', {
              type: 'button', class: 'btn btn-primary', text: 'Restore',
              onClick: () => { close(); io.restoreBackup(); toast('Backup restored.'); rerender(); },
            })));
        });
      },
    }, icon('back'), 'Restore backup', h('span', { class: 'val', text: 'from last import' })));
  }
  el.appendChild(rows);
  el.appendChild(fileInput);

  const used = storage.usage();
  const last = s.lastExport;
  el.appendChild(h('p', { class: 'help' },
    plural(state.habits().length, 'habit') + ' · '
    + (used > 1024 ? Math.round(used / 1024) + ' KB' : used + ' bytes') + ' stored · '
    + (last ? 'last export ' + longDate(last) : 'never exported') + '.'));

  // -- app
  el.appendChild(h('div', { class: 'section-title', text: 'App' }));
  const appRows = h('div', { class: 'rows' });
  if (!isStandalone()) {
    appRows.appendChild(h('button', {
      type: 'button', class: 'row', onClick: () => {
        if (canInstall()) promptInstall().then(ok => { if (ok) rerender(); });
        else toast('Open your browser menu and choose "Add to Home screen".', { timeout: 6000 });
      },
    }, icon('download'), 'Add to Home screen'));
  }
  appRows.appendChild(h('button', {
    type: 'button', class: 'row', onClick: () => {
      openSheet((sheet, close) => {
        sheet.appendChild(h('h3', { text: 'Where your data lives' }));
        sheet.appendChild(h('p', {},
          'Everything is in this browser, under one key, on this device. The app makes '
          + 'no network requests of any kind — its content security policy forbids them '
          + 'outright, so it cannot phone home even by mistake.'));
        sheet.appendChild(h('p', {},
          'Nothing is backed up for you. Clearing site data, or uninstalling, erases it. '
          + 'Export now and then.'));
        sheet.appendChild(h('button', { type: 'button', class: 'btn', text: 'Close', onClick: close }));
      });
    },
  }, icon('book'), 'About your data'));

  appRows.appendChild(h('button', {
    type: 'button', class: 'row', style: 'color:var(--danger)',
    onClick: () => {
      openSheet((sheet, close) => {
        sheet.appendChild(h('h3', { text: 'Delete everything?' }));
        sheet.appendChild(h('p', {},
          'Every habit, every tick, your name and settings. There is no undo and no copy '
          + 'anywhere else. Export first if you are not certain.'));
        sheet.appendChild(h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', text: 'Cancel', onClick: close }),
          h('button', {
            type: 'button', class: 'btn btn-danger', text: 'Delete everything',
            onClick: () => { close(); state.reset(); go('#/welcome'); },
          })));
      });
    },
  }, icon('trash'), 'Delete everything'));
  el.appendChild(appRows);

  el.appendChild(h('p', { class: 'help', style: 'text-align:center;margin-top:26px' },
    'Habit Grid · local-first · no accounts, no server, no requests'));

  function startImport(file) {
    io.readFile(file)
      .then((raw) => {
        const result = io.validate(raw);
        if (!result.ok) {
          openSheet((sheet, close) => {
            sheet.appendChild(h('h3', { text: 'That import was refused' }));
            sheet.appendChild(h('p', { text: 'Nothing was changed. ' + result.errors.join(' ') }));
            sheet.appendChild(h('button', { type: 'button', class: 'btn', text: 'Close', onClick: close }));
          });
          return;
        }
        openSheet((sheet, close) => {
          const c = result.counts;
          sheet.appendChild(h('h3', { text: 'Import ' + plural(c.habits, 'habit') + '?' }));
          sheet.appendChild(h('p', {},
            'That file holds ' + plural(c.habits, 'habit') + ', ' + plural(c.days, 'day')
            + ' of history and ' + plural(c.ticks, 'tick') + '. '
            + 'Your current data is backed up first either way.'
            + (result.warnings.length ? ' ' + result.warnings.join(' ') : '')));
          sheet.appendChild(h('div', { class: 'rows' },
            h('button', {
              type: 'button', class: 'row', onClick: () => {
                close(); io.merge(result.data); toast('Merged.'); rerender();
              },
            }, icon('plus'), 'Merge',
              h('span', { class: 'val', text: 'keep both, higher count wins' })),
            h('button', {
              type: 'button', class: 'row', onClick: () => {
                close(); io.replaceAll(result.data); toast('Replaced.'); rerender();
              },
            }, icon('upload'), 'Replace',
              h('span', { class: 'val', text: 'wipe, then load' }))));
          sheet.appendChild(h('div', { style: 'height:12px' }));
          sheet.appendChild(h('button', { type: 'button', class: 'btn', text: 'Cancel', onClick: close }));
        });
      })
      .catch(err => toast(err.message, { error: true }));
  }

  return { el, update() {} };
}

function selectRow(label, value, options, onChange) {
  const sel = h('select', { 'aria-label': label, onChange: (e) => onChange(e.target.value) });
  options.forEach(o => sel.appendChild(h('option', {
    value: o.value, text: o.label, selected: String(o.value) === String(value),
  })));
  return h('div', { class: 'row' }, h('span', { text: label }), sel);
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings().theme || 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.settings().theme === 'black' ? '#000000' : '#131210');
}

let rerenderHook = () => {};
export function setRerender(fn) { rerenderHook = fn; }
function rerender() { rerenderHook(); }
