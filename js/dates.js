// dates.js — calendar maths on local YYYY-MM-DD strings. No language here:
// month and weekday names, and how a date is written out, live in i18n.js.
//
// Rule of the house: never toISOString(). It converts to UTC and silently
// records the wrong day for anyone west of Greenwich in the evening. Every key
// here is built from getFullYear/getMonth/getDate, and every step is calendar
// arithmetic (setDate) rather than epoch arithmetic, so the 23- and 25-hour
// days of DST neither skip nor duplicate a cell.

export function keyOf(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayKey() {
  return keyOf(new Date());
}

/** Local midnight for a key. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isKey(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

/** Add months, clamping the day (Jan 31 + 1 month = Feb 28). */
export function addMonths(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const total = (y * 12) + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12;
  const day = Math.min(d, daysInMonth(ny, nm + 1));
  return keyOf(new Date(ny, nm, day));
}

/** Whole days from a to b. Uses UTC only to subtract two calendar dates. */
export function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function daysInMonth(y, m /* 1-based */) {
  return new Date(y, m, 0).getDate();
}

export function yearOf(key) { return Number(key.slice(0, 4)); }
export function monthOf(key) { return Number(key.slice(5, 7)); }
export function dayOf(key) { return Number(key.slice(8, 10)); }

export function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function min(a, b) { return a < b ? a : b; }
export function max(a, b) { return a > b ? a : b; }

/** 0 = first column of the week, given weekStart (1 = Monday, 0 = Sunday). */
export function weekdayIndex(key, weekStart) {
  return (parseKey(key).getDay() - weekStart + 7) % 7;
}

export function startOfWeek(key, weekStart) {
  return addDays(key, -weekdayIndex(key, weekStart));
}

// ── Ranges ──────────────────────────────────────────────────────────────────

// Labels live in i18n.js; this file stays pure arithmetic.
export const RANGES = [
  { id: '1w',  days: 7 },
  { id: '1m',  months: 1 },
  { id: '3m',  months: 3 },
  { id: '6m',  months: 6 },
  { id: '1y',  months: 12 },
  { id: '2y',  months: 24 },
  { id: '5y',  months: 60 },
  { id: '10y', months: 120 },
  { id: 'all' },
];

export const RANGE_IDS = RANGES.map(r => r.id);

/** First day shown for a range, inclusive. */
export function rangeStart(rangeId, createdAt, today = todayKey()) {
  const r = RANGES.find(x => x.id === rangeId) || RANGES[4];
  if (r.id === 'all') return min(createdAt || today, today);
  if (r.days) return addDays(today, -(r.days - 1));
  return addDays(addMonths(today, -r.months), 1);
}
