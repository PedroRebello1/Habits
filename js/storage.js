// storage.js — the only module that touches localStorage.
//
// Writes are debounced 200 ms and force-flushed on pagehide, so a rapid burst
// of ticks costs one serialise instead of twenty. A failed write (quota, private
// mode) is surfaced through onError rather than swallowed: a tick must never
// disappear quietly.

export const KEY = 'habitgrid.v1';
export const BACKUP_KEY = 'habitgrid.backup';
export const SCHEMA = 1;

const listeners = { error: [], external: [] };
let timer = null;
let pending = null;

export function onError(fn) { listeners.error.push(fn); }
export function onExternalChange(fn) { listeners.external.push(fn); }
const emit = (kind, arg) => listeners[kind].forEach(f => f(arg));

export function defaultState() {
  return {
    schema: SCHEMA,
    onboarded: false,
    username: '',
    settings: {
      weekStart: 1,
      theme: 'dark',
      defaultRange: '1y',
      density: 'auto',
      lastExport: null,
    },
    habits: [],
    entries: {},
  };
}

/** Reads and normalises. Returns null when nothing has ever been stored. */
export function read() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch (err) {
    emit('error', err);
    return null;
  }
  if (!raw) return null;
  try {
    return normalise(JSON.parse(raw));
  } catch (err) {
    emit('error', new Error('Stored data could not be parsed. It has been left untouched.'));
    return null;
  }
}

/** Fills in anything a hand-edited or older payload is missing. */
export function normalise(data) {
  const base = defaultState();
  if (!data || typeof data !== 'object') return base;
  const out = {
    schema: SCHEMA,
    onboarded: data.onboarded !== false,
    username: typeof data.username === 'string' ? data.username : '',
    settings: { ...base.settings, ...(data.settings || {}) },
    habits: Array.isArray(data.habits) ? data.habits : [],
    entries: (data.entries && typeof data.entries === 'object') ? data.entries : {},
  };
  out.habits.forEach((h, i) => {
    if (typeof h.order !== 'number') h.order = i;
    if (!h.icon || typeof h.icon !== 'object') h.icon = { type: 'letter', value: (h.name || '?')[0] };
    if (typeof h.target !== 'number' || h.target < 1) h.target = 1;
    if (!out.entries[h.id]) out.entries[h.id] = {};
  });
  return out;
}

export function write(state) {
  pending = state;
  if (timer !== null) return;
  timer = setTimeout(flush, 200);
}

/** Writes immediately. Returns true on success; errors are also emitted. */
export function flush() {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (!pending) return true;
  const snapshot = pending;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    pending = null;
    return true;
  } catch (err) {
    // Keep `pending` so the next flush retries rather than losing the write.
    emit('error', err);
    return false;
  }
}

export function hasPendingWrite() { return pending !== null; }

/** Used by import: snapshot the current payload before overwriting it. */
export function backup() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) localStorage.setItem(BACKUP_KEY, raw);
    return true;
  } catch (err) {
    emit('error', err);
    return false;
  }
}

export function readBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function clearBackup() {
  try { localStorage.removeItem(BACKUP_KEY); } catch { /* nothing to do */ }
}

export function wipe() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BACKUP_KEY);
    pending = null;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    return true;
  } catch (err) { emit('error', err); return false; }
}

/** Roughly how many bytes the payload occupies, for Settings. */
export function usage() {
  try { return (localStorage.getItem(KEY) || '').length; } catch { return 0; }
}

export function describeError(err) {
  const name = err && err.name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'Storage is full — that change was not saved. Export your data, then delete a habit to free space.';
  }
  if (name === 'SecurityError') {
    return 'This browser is blocking local storage (private mode?). Nothing can be saved.';
  }
  return (err && err.message) || 'Could not save to this device.';
}

// Another tab wrote: reload rather than clobber.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) emit('external', read());
  });
  window.addEventListener('pagehide', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
