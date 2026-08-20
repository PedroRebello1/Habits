// grid.js — the contribution grid: layout planning, three cell units, and
// windowed rendering for the long ranges.
//
// The layout is described by a plan whose columns are produced lazily via
// colAt(i), so a decade of day cells costs no memory until it is scrolled into
// view. Column positions are precomputed once per layout — they are not a plain
// multiple of the pitch, because months are set a little apart — so finding the
// visible window is a binary search rather than any measuring of the DOM.

import {
  todayKey, addDays, diffDays, startOfWeek, monthOf, yearOf, dayOf,
  daysInMonth, longDate, weekdayLetter, MONTHS, MONTHS_LONG, min, max,
} from './dates.js';

// Range id -> cell unit and size, from the density table in the plan.
const DENSITY = {
  '1w':  { unit: 'day',   size: 40, gap: 6 },
  '1m':  { unit: 'day',   size: 24, gap: 4 },
  '3m':  { unit: 'day',   size: 15, gap: 3 },
  '6m':  { unit: 'day',   size: 13, gap: 3 },
  '1y':  { unit: 'day',   size: 11, gap: 2 },
  '2y':  { unit: 'day',   size: 9,  gap: 2 },
  '5y':  { unit: 'week',  size: 12, gap: 3 },
  '10y': { unit: 'month', size: 21, gap: 4 },
};
const FORCED = {
  day:   { size: 11, gap: 2 },
  week:  { size: 12, gap: 3 },
  month: { size: 21, gap: 4 },
};
const VIRTUAL_THRESHOLD = 60;   // columns beyond which the render is windowed
const BUFFER = 8;               // columns kept either side of the viewport

/** For "all time": pick the density whose range fits the span. */
export function autoRange(spanDays) {
  if (spanDays <= 7) return '1w';
  if (spanDays <= 31) return '1m';
  if (spanDays <= 92) return '3m';
  if (spanDays <= 183) return '6m';
  if (spanDays <= 366) return '1y';
  if (spanDays <= 800) return '2y';
  if (spanDays <= 1900) return '5y';
  return '10y';
}

export function densityFor(rangeId, createdAt, today, pref) {
  let effective = rangeId;
  if (rangeId === 'all') effective = autoRange(diffDays(createdAt, today) + 1);
  const base = DENSITY[effective] || DENSITY['1y'];
  if (pref && pref !== 'auto' && FORCED[pref]) {
    return { unit: pref, size: FORCED[pref].size, gap: FORCED[pref].gap, effective };
  }
  return { unit: base.unit, size: base.size, gap: base.gap, effective };
}

// -- Plans -------------------------------------------------------------------
// Every plan exposes unit, rows, cols, pitch, size, gap, width, height, labelH,
// gutterW and colAt(i) -> { x, label, rule, cells: [{ row, from, to }] }.

function dayPlan(startKey, today, weekStart, size, gap, single) {
  const pitch = size + gap;

  if (single) {
    // One-week view: a single row of large cells with weekday captions below.
    const cols = diffDays(startKey, today) + 1;
    return {
      unit: 'day', single: true, rows: 1, cols, pitch, size, gap,
      labelH: 0, gutterW: 0, labelsBelow: true,
      width: cols * pitch - gap, height: size + 26,
      colAt(i) {
        const k = addDays(startKey, i);
        return { x: i * pitch, cells: [{ row: 0, from: k, to: k }] };
      },
    };
  }

  const gridStart = startOfWeek(startKey, weekStart);
  const lastCol = startOfWeek(today, weekStart);
  const cols = Math.floor(diffDays(gridStart, lastCol) / 7) + 1;
  const labelH = 15;

  // A hair of extra space where one month gives way to the next — enough to
  // read them apart, far less than the year blocks in the five-year view.
  // Column positions stop being i * pitch once that is in, so they are
  // precomputed and the virtualizer binary-searches them.
  const monthGap = Math.max(2, Math.round(size * 0.25));
  const xs = new Array(cols);
  let x = 0, prevMonth = 0;
  for (let i = 0; i < cols; i++) {
    const m = monthOf(addDays(gridStart, i * 7));
    if (i > 0 && m !== prevMonth) x += monthGap;
    xs[i] = x;
    x += pitch;
    prevMonth = m;
  }

  return {
    unit: 'day', rows: 7, cols, pitch, size, gap, labelH, gutterW: 0, monthGap, xs,
    width: x - gap, height: labelH + 7 * pitch - gap,
    colAt(i) {
      const ws = addDays(gridStart, i * 7);
      const cells = [];
      for (let r = 0; r < 7; r++) {
        const k = addDays(ws, r);
        if (k < startKey || k > today) cells.push({ row: r, blank: true });
        else cells.push({ row: r, from: k, to: k });
      }
      const prev = i > 0 ? addDays(gridStart, (i - 1) * 7) : null;
      const label = (!prev || monthOf(ws) !== monthOf(prev)) ? MONTHS[monthOf(ws) - 1] : null;
      const rule = !!prev && yearOf(ws) !== yearOf(prev);
      return { x: xs[i], cells, label, rule, month: monthOf(ws) };
    },
  };
}

// Five-year view: one block per calendar year, 13 columns by 4 rows of week
// cells. Slots are seven days from Jan 1 and the last slot absorbs the
// remainder, so the 53rd-week drift never opens a gap or double-counts a day.
function weekPlan(firstYear, lastYear, today, size, gap) {
  const pitch = size + gap;
  const COLS = 13, ROWS = 4;
  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  const blockW = COLS * pitch;
  const blockGap = pitch;
  const labelH = 15;
  const cols = years.length * COLS;
  const xs = new Array(cols);
  for (let i = 0; i < cols; i++) {
    xs[i] = Math.floor(i / COLS) * (blockW + blockGap) + (i % COLS) * pitch;
  }
  return {
    unit: 'week', rows: ROWS, cols, pitch, size, gap,
    labelH, gutterW: 0, years, xs, monthGap: 0,
    width: years.length * blockW + (years.length - 1) * blockGap - gap,
    height: labelH + ROWS * pitch - gap,
    colAt(i) {
      const b = Math.floor(i / COLS), c = i % COLS;
      const year = years[b];
      const x = xs[i];
      const cells = [];
      for (let r = 0; r < ROWS; r++) {
        const slot = c * ROWS + r;
        const from = addDays(year + '-01-01', slot * 7);
        if (yearOf(from) !== year || from > today) { cells.push({ row: r, blank: true }); continue; }
        const to = slot === COLS * ROWS - 1 ? year + '-12-31' : addDays(from, 6);
        cells.push({ row: r, from, to: min(to, today) });
      }
      return { x, cells, label: c === 0 ? String(year) : null, rule: c === 0 && b > 0 };
    },
  };
}

// Ten-year view: twelve month columns, one row per year — the whole decade on
// one screen, so this layout never scrolls.
function monthPlan(firstYear, lastYear, today, size, gap) {
  const pitch = size + gap;
  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  const labelH = 15, gutterW = 26;
  return {
    unit: 'month', rows: years.length, cols: 12, pitch, size, gap,
    labelH, gutterW, years, matrix: true,
    width: gutterW + 12 * pitch - gap,
    height: labelH + years.length * pitch - gap,
    colAt(i) {
      const m = String(i + 1).padStart(2, '0');
      const cells = [];
      for (let r = 0; r < years.length; r++) {
        const y = years[r];
        const from = y + '-' + m + '-01';
        if (from > today) { cells.push({ row: r, blank: true }); continue; }
        const to = y + '-' + m + '-' + daysInMonth(y, i + 1);
        cells.push({ row: r, from, to: min(to, today) });
      }
      return { x: gutterW + i * pitch, cells, label: MONTHS[i][0], rule: false };
    },
  };
}

export function planFor(cfg) {
  const d = densityFor(cfg.rangeId, cfg.createdAt, cfg.today, cfg.pref);
  if (d.unit === 'day') {
    return dayPlan(cfg.startKey, cfg.today, cfg.weekStart, d.size, d.gap, d.effective === '1w');
  }
  const thisYear = yearOf(cfg.today);
  const startYear = yearOf(cfg.startKey);
  // "All time" means all of it — the density label says 10y but the window
  // still has to reach back to createdAt. Otherwise the year span comes from
  // the range, clamped so a short range never invents empty years.
  const want = d.unit === 'week' ? (d.effective === '5y' ? 4 : 9) : 9;
  const firstYear = cfg.rangeId === 'all'
    ? Math.max(startYear, thisYear - 60)
    : Math.min(Math.max(startYear, thisYear - want), thisYear);
  if (d.unit === 'week') return weekPlan(firstYear, thisYear, cfg.today, d.size, d.gap);
  return monthPlan(firstYear, thisYear, cfg.today, d.size, d.gap);
}

// -- The grid component ------------------------------------------------------

export function createGrid(opts) {
  const o = Object.assign({
    range: '1y',
    startKey: null,
    createdAt: null,
    target: 1,
    weekStart: 1,
    pref: 'auto',
    interactive: true,
    showToday: true,
    onTick: null,   // (dateKey, next) after a write
    onZoom: null,   // (from, to, unit) an aggregate cell was tapped
    onStep: null,   // (dateKey, node) long press
    read: null,     // (dateKey) -> count
    write: null,    // (dateKey, count) -> void
  }, opts);

  const el = document.createElement('div');
  el.className = 'grid';
  const scroller = document.createElement('div');
  scroller.className = 'grid-scroll';
  const canvas = document.createElement('div');
  canvas.className = 'grid-canvas';
  scroller.appendChild(canvas);
  el.appendChild(scroller);

  let plan = null;
  let today = todayKey();
  const live = new Map();     // column index -> element
  let pinned = false;
  let focus = { col: -1, row: 0 };
  let rafId = 0;

  const read = (k) => (o.read ? o.read(k) || 0 : 0);
  const target = () => Math.max(1, o.target || 1);

  function build() {
    today = todayKey();
    plan = planFor({
      rangeId: o.range, startKey: o.startKey, createdAt: o.createdAt || today,
      today, weekStart: o.weekStart, pref: o.pref,
    });
    el.dataset.unit = plan.unit;
    el.classList.toggle('is-matrix', !!plan.matrix);
    el.classList.toggle('is-single', !!plan.single);
    canvas.style.width = plan.width + 'px';
    canvas.style.height = plan.height + 'px';
    canvas.style.setProperty('--size', plan.size + 'px');
    canvas.style.setProperty('--gap', plan.gap + 'px');
    canvas.style.setProperty('--month-gap', (plan.monthGap || 0) + 'px');
    canvas.style.setProperty('--pitch', plan.pitch + 'px');
    canvas.style.setProperty('--label-h', plan.labelH + 'px');
    canvas.textContent = '';
    live.clear();
    focus = { col: plan.cols - 1, row: 0 };
    focus.row = lastRow(plan.cols - 1);
    if (plan.matrix) renderGutter();
    pinned = false;
    renderWindow(true);
    pinRight();
  }

  function lastRow(colIndex) {
    const col = plan.colAt(Math.max(0, colIndex));
    for (let r = col.cells.length - 1; r >= 0; r--) if (!col.cells[r].blank) return r;
    return 0;
  }

  function renderGutter() {
    const g = document.createElement('div');
    g.className = 'grid-gutter';
    g.setAttribute('aria-hidden', 'true');
    plan.years.forEach((y, r) => {
      const s = document.createElement('span');
      s.className = 'grid-year';
      s.style.top = (plan.labelH + r * plan.pitch) + 'px';
      s.style.height = plan.size + 'px';
      s.textContent = "'" + String(y).slice(2);
      g.appendChild(s);
    });
    canvas.appendChild(g);
  }

  /** Index of the last column starting at or before x. */
  function colBefore(x) {
    const xs = plan.xs;
    if (!xs) return Math.floor(x / plan.pitch);
    let lo = 0, hi = xs.length - 1, found = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  function windowRange() {
    const virtual = plan.cols > VIRTUAL_THRESHOLD && !plan.matrix;
    if (!virtual) return [0, plan.cols - 1];
    const w = scroller.clientWidth;
    if (!w) return [Math.max(0, plan.cols - 40), plan.cols - 1];   // laid out later
    const sl = scroller.scrollLeft;
    const first = Math.max(0, colBefore(sl) - BUFFER);
    const last = Math.min(plan.cols - 1, colBefore(sl + w) + BUFFER);
    return [first, last];
  }

  function renderWindow(force) {
    if (!plan) return;
    const bounds = windowRange();
    live.forEach((node, i) => {
      if (i < bounds[0] || i > bounds[1]) { node.remove(); live.delete(i); }
    });
    for (let i = bounds[0]; i <= bounds[1]; i++) {
      if (live.has(i)) { if (force) repaintColumn(i); continue; }
      const node = buildColumn(i);
      live.set(i, node);
      canvas.appendChild(node);
    }
    // Scrolling can recycle away the column holding the roving tabindex; keep
    // exactly one cell tabbable so the grid never leaves the tab order.
    if (!canvas.querySelector('.cell[tabindex="0"]')) {
      const fallback = nearestFocusable(focus.col, focus.row) || canvas.querySelector('button.cell');
      if (fallback) fallback.tabIndex = 0;
    }
    placeTodayMark();
  }

  function buildColumn(i) {
    const col = plan.colAt(i);
    const wrap = document.createElement('div');
    wrap.className = 'gcol';
    wrap.style.transform = 'translateX(' + col.x + 'px)';
    wrap.dataset.col = String(i);

    if (col.label && labelVisible(col, i)) {
      const lab = document.createElement('span');
      lab.className = 'gcol-label';
      lab.textContent = col.label;
      lab.setAttribute('aria-hidden', 'true');
      wrap.appendChild(lab);
    }
    if (col.rule) {
      const rule = document.createElement('span');
      rule.className = 'gcol-rule';
      rule.setAttribute('aria-hidden', 'true');
      wrap.appendChild(rule);
    }
    for (const c of col.cells) wrap.appendChild(buildCell(c, i));

    if (plan.labelsBelow) {
      const cap = document.createElement('span');
      cap.className = 'gcol-caption';
      cap.style.top = (plan.size + 7) + 'px';
      cap.setAttribute('aria-hidden', 'true');
      const k = col.cells[0].from;
      const wd = document.createElement('em');
      wd.textContent = weekdayLetter(k);
      const dn = document.createElement('b');
      dn.textContent = String(dayOf(k));
      cap.appendChild(wd);
      cap.appendChild(dn);
      wrap.appendChild(cap);
    }
    return wrap;
  }

  // Month labels collide once the pitch drops; thin them out rather than
  // letting them overlap.
  function labelVisible(col, i) {
    if (plan.unit !== 'day') return true;
    const perMonth = plan.pitch * 4.34;          // px between month starts
    const step = Math.max(1, Math.ceil(30 / perMonth));
    return step === 1 || (col.month - 1) % step === 0;
  }

  function buildCell(c, colIndex) {
    if (c.blank) {
      const b = document.createElement('span');
      b.className = 'cell cell-blank';
      b.style.top = (c.row * plan.pitch) + 'px';
      return b;
    }
    const aggregate = c.from !== c.to;
    const tappable = o.interactive || aggregate;
    const node = document.createElement(tappable ? 'button' : 'span');
    node.className = 'cell';
    node.style.top = (c.row * plan.pitch) + 'px';
    node.dataset.from = c.from;
    node.dataset.to = c.to;
    node.dataset.row = String(c.row);
    node.dataset.col = String(colIndex);
    if (tappable) {
      node.type = 'button';
      node.tabIndex = (colIndex === focus.col && c.row === focus.row) ? 0 : -1;
    }
    paint(node);
    return node;
  }

  /** Recompute one cell's fill level and label from current data. */
  function paint(node) {
    const from = node.dataset.from, to = node.dataset.to;
    const t = target();
    let level = 0, label = '';

    if (from === to) {
      const n = read(from);
      level = Math.min(n / t, 1);
      node.classList.toggle('is-today', from === today);
      node.classList.toggle('is-pre', !!o.createdAt && from < o.createdAt && n === 0);
      label = longDate(from) + ' — ' + (t > 1
        ? n + ' of ' + t + ' done'
        : (n > 0 ? 'done' : 'not done'));
    } else {
      let days = 0, done = 0;
      for (let k = from; k <= to; k = addDays(k, 1)) {
        days++;
        if (read(k) >= t) done++;
      }
      level = days ? done / days : 0;
      node.classList.toggle('is-today', from <= today && today <= to);
      label = periodLabel(from) + ' — ' + done + ' of ' + days + ' days done';
    }

    node.style.setProperty('--level', String(level));
    node.classList.toggle('is-empty', level === 0);
    if (node.tagName === 'BUTTON') node.setAttribute('aria-label', label);
    else node.title = label;
  }

  function periodLabel(from) {
    if (plan.unit === 'month') return MONTHS_LONG[monthOf(from) - 1] + ' ' + yearOf(from);
    return 'Week of ' + longDate(from);
  }

  function repaintColumn(i) {
    const node = live.get(i);
    if (node) node.querySelectorAll('.cell:not(.cell-blank)').forEach(paint);
  }

  // The signature: a brass hairline down the right edge of today's column. Every
  // card pins to the right on load, so all of them line up on the same "now".
  function placeTodayMark() {
    let mark = canvas.querySelector('.grid-today');
    if (!o.showToday || plan.unit !== 'day' || plan.single) {
      if (mark) mark.remove();
      return;
    }
    if (!mark) {
      mark = document.createElement('span');
      mark.className = 'grid-today';
      mark.setAttribute('aria-hidden', 'true');
      canvas.appendChild(mark);
    }
    // Sits on the canvas's right edge, not offset by the gap: every card is
    // right-aligned to the same edge, so every hairline lands on the same x
    // whatever cell size that habit's range uses.
    mark.style.left = (plan.width - 0.5) + 'px';
    mark.style.top = plan.labelH + 'px';
    mark.style.height = (plan.height - plan.labelH) + 'px';
  }

  function pinRight() {
    if (plan.matrix) { pinned = true; return; }
    scroller.scrollLeft = scroller.scrollWidth;
    if (scroller.clientWidth > 0) pinned = true;
  }

  // -- interaction ----------------------------------------------------------

  let pressTimer = 0, pressed = null, pressAt = null, longFired = false;

  function cellOf(node) {
    const cell = node && node.closest ? node.closest('.cell') : null;
    return cell && !cell.classList.contains('cell-blank') ? cell : null;
  }

  function onPointerDown(e) {
    const node = cellOf(e.target);
    if (!node || !o.interactive || node.dataset.from !== node.dataset.to) return;
    if (node.dataset.from > today) return;
    pressed = node;
    longFired = false;
    pressAt = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longFired = true;
      pressed = null;
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* optional */ } }
      if (o.onStep) o.onStep(node.dataset.from, node);
    }, 450);
  }

  function cancelPress() { clearTimeout(pressTimer); pressed = null; }

  function onPointerMove(e) {
    if (!pressed || !pressAt) return;
    if (Math.abs(e.clientX - pressAt.x) > 8 || Math.abs(e.clientY - pressAt.y) > 8) cancelPress();
  }

  function onClick(e) {
    const node = cellOf(e.target);
    if (!node) return;
    if (longFired) { longFired = false; return; }
    cancelPress();
    const from = node.dataset.from, to = node.dataset.to;
    if (from !== to) {                       // aggregate cells zoom, they never tick
      if (o.onZoom) o.onZoom(from, to, plan.unit);
      return;
    }
    if (!o.interactive || from > today) return;
    const t = target();
    const current = read(from);
    const next = current >= t ? 0 : current + 1;
    if (o.write) o.write(from, next);
    paint(node);
    setFocus(Number(node.dataset.col), Number(node.dataset.row), false);
    if (o.onTick) o.onTick(from, next);
  }

  function onKeyDown(e) {
    const node = cellOf(e.target);
    if (!node) return;
    let c = Number(node.dataset.col), r = Number(node.dataset.row);
    switch (e.key) {
      case 'ArrowUp': r--; break;
      case 'ArrowDown': r++; break;
      case 'ArrowLeft': c--; break;
      case 'ArrowRight': c++; break;
      case 'Home': c = 0; r = 0; break;
      case 'End': c = plan.cols - 1; r = lastRow(plan.cols - 1); break;
      default: return;
    }
    if (r < 0) { r = plan.rows - 1; c--; }
    if (r >= plan.rows) { r = 0; c++; }
    c = Math.max(0, Math.min(plan.cols - 1, c));
    r = Math.max(0, Math.min(plan.rows - 1, r));
    e.preventDefault();
    setFocus(c, r, true);
  }

  /** Nearest tappable cell to (c, r), searching outward within the column.
   *  The first column of a range and the last of an aggregate block hold blank
   *  spacers, and focus must never land on one — or fall out of the page
   *  entirely, taking the grid out of the tab order with it. */
  function nearestFocusable(c, r) {
    for (let d = 0; d < plan.rows; d++) {
      for (const rr of (d === 0 ? [r] : [r - d, r + d])) {
        if (rr < 0 || rr >= plan.rows) continue;
        const n = canvas.querySelector('.cell[data-col="' + c + '"][data-row="' + rr + '"]');
        if (n && n.tagName === 'BUTTON') return n;
      }
    }
    return null;
  }

  function setFocus(c, r, moveFocus) {
    if (!plan.matrix) {
      const x = plan.xs ? plan.xs[c] : c * plan.pitch;
      const w = scroller.clientWidth;
      if (x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - plan.pitch);
      else if (x + plan.pitch > scroller.scrollLeft + w) scroller.scrollLeft = x + plan.pitch - w;
      renderWindow(false);
    }
    const node = nearestFocusable(c, r)
      || canvas.querySelector('button.cell');   // last resort: keep one cell tabbable
    if (!node) return;
    focus = { col: Number(node.dataset.col), row: Number(node.dataset.row) };
    canvas.querySelectorAll('.cell[tabindex="0"]').forEach((n) => { n.tabIndex = -1; });
    node.tabIndex = 0;
    if (moveFocus) node.focus();
  }

  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; renderWindow(false); });
  }

  scroller.addEventListener('scroll', onScroll, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerup', cancelPress);
  canvas.addEventListener('pointercancel', cancelPress);
  canvas.addEventListener('pointerleave', cancelPress);
  canvas.addEventListener('contextmenu', (e) => { if (cellOf(e.target)) e.preventDefault(); });
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('keydown', onKeyDown);

  const ro = new ResizeObserver(() => {
    if (!plan) return;
    if (!pinned && scroller.clientWidth > 0) pinRight();
    renderWindow(false);
  });
  ro.observe(scroller);

  build();

  return {
    el,
    plan: () => plan,
    /** Cheap: repaint the cells currently on screen. */
    refresh() {
      today = todayKey();
      live.forEach((node, i) => repaintColumn(i));
      placeTodayMark();
    },
    /** Expensive: recompute the layout after a range, target or day change. */
    rebuild(next) {
      Object.assign(o, next || {});
      build();
    },
    scrollToToday() { pinRight(); },
    destroy() {
      ro.disconnect();
      clearTimeout(pressTimer);
      if (rafId) cancelAnimationFrame(rafId);
      scroller.removeEventListener('scroll', onScroll);
      el.remove();
    },
  };
}
