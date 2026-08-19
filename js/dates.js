// dates.js — calendar maths on local YYYY-MM-DD strings.
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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** "19 August" / "19 August 2024" when the year differs from today's. */
export function longDate(key) {
  const y = yearOf(key);
  const s = `${dayOf(key)} ${MONTHS_LONG[monthOf(key) - 1]}`;
  return y === new Date().getFullYear() ? s : `${s} ${y}`;
}

export function shortDate(key) {
  return `${dayOf(key)} ${MONTHS[monthOf(key) - 1]}`;
}

export function weekdayLetter(key) {
  return WEEKDAY_LETTERS[parseKey(key).getDay()];
}

export function weekdayName(key) {
  return WEEKDAYS[parseKey(key).getDay()];
}

// ── Ranges ──────────────────────────────────────────────────────────────────

export const RANGES = [
  { id: '1w',  label: '1 week',    short: '1W',  days: 7 },
  { id: '1m',  label: '1 month',   short: '1M',  months: 1 },
  { id: '3m',  label: '3 months',  short: '3M',  months: 3 },
  { id: '6m',  label: '6 months',  short: '6M',  months: 6 },
  { id: '1y',  label: '1 year',    short: '1Y',  months: 12 },
  { id: '2y',  label: '2 years',   short: '2Y',  months: 24 },
  { id: '5y',  label: '5 years',   short: '5Y',  months: 60 },
  { id: '10y', label: '10 years',  short: '10Y', months: 120 },
  { id: 'all', label: 'All time',  short: 'ALL' },
];

export const RANGE_IDS = RANGES.map(r => r.id);
export function rangeLabel(id) { return (RANGES.find(r => r.id === id) || RANGES[4]).label; }

/** First day shown for a range, inclusive. */
export function rangeStart(rangeId, createdAt, today = todayKey()) {
  const r = RANGES.find(x => x.id === rangeId) || RANGES[4];
  if (r.id === 'all') return min(createdAt || today, today);
  if (r.days) return addDays(today, -(r.days - 1));
  return addDays(addMonths(today, -r.months), 1);
}
