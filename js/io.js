// io.js — export, import, validation, backup.
//
// Nothing here touches the network. Export is a Blob and an object URL; import
// is a file picker. Every import snapshots the current payload to
// habitgrid.backup first, so a wrong choice is recoverable from Settings.

import * as storage from './storage.js';
import * as state from './state.js';
import { isKey, todayKey, diffDays, RANGE_IDS } from './dates.js';

export function payload() {
  const s = state.get();
  return {
    schema: storage.SCHEMA,
    exportedAt: todayKey(),
    onboarded: true,
    username: s.username,
    settings: s.settings,
    habits: s.habits,
    entries: s.entries,
  };
}

export function filename() {
  const name = (state.get().username || 'me')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'me';
  return 'habitgrid-' + name + '-' + todayKey() + '.json';
}

export function serialise() {
  return JSON.stringify(payload(), null, 2);
}

/** Blob download. Returns false if the browser refused, so the caller can
 *  fall back to the clipboard. */
export function download() {
  try {
    const blob = new Blob([serialise()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    state.markExported();
    return true;
  } catch (err) {
    return false;
  }
}

export function copyToClipboard() {
  const text = serialise();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => { state.markExported(); return true; });
  }
  // Fallback for browsers without the async clipboard API.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) state.markExported();
    return Promise.resolve(ok);
  } catch (err) {
    return Promise.reject(err);
  }
}

export function daysSinceExport() {
  const last = state.get().settings.lastExport;
  if (!last || !isKey(last)) return null;
  return diffDays(last, todayKey());
}

// -- validation --------------------------------------------------------------

const ID_RE = /^h_[a-z0-9]{4,32}$/i;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Checks a parsed payload before anything is written. Returns
 *  { ok, errors, warnings, data, counts }. */
export function validate(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['That file is not a Habit Grid export.'] };
  }
  if (raw.schema !== undefined && Number(raw.schema) > storage.SCHEMA) {
    errors.push('That file was written by a newer version of Habit Grid (schema '
      + raw.schema + '). Update the app first.');
  }
  if (!Array.isArray(raw.habits)) {
    return { ok: false, errors: ['That file has no habits list.'] };
  }
  if (raw.entries === null || typeof raw.entries !== 'object' || Array.isArray(raw.entries)) {
    return { ok: false, errors: ['That file has no entries object.'] };
  }

  const seen = new Set();
  const habits = [];
  raw.habits.forEach((h, i) => {
    const where = 'habit ' + (i + 1);
    if (!h || typeof h !== 'object') { errors.push(where + ' is not an object.'); return; }
    if (typeof h.id !== 'string' || !ID_RE.test(h.id)) {
      errors.push(where + ' has an invalid id.');
      return;
    }
    if (seen.has(h.id)) { errors.push('Two habits share the id ' + h.id + '.'); return; }
    seen.add(h.id);
    if (h.createdAt !== undefined && !isKey(h.createdAt)) {
      warnings.push(where + ' had an unreadable created date; today was used.');
    }
    habits.push({
      id: h.id,
      name: typeof h.name === 'string' && h.name.trim() ? h.name.trim().slice(0, 40) : 'Untitled',
      icon: sanitiseIcon(h.icon),
      color: COLOR_RE.test(h.color) ? h.color : '#C6A15B',
      target: Number.isFinite(h.target) ? Math.max(1, Math.min(20, Math.round(h.target))) : 1,
      range: RANGE_IDS.indexOf(h.range) >= 0 ? h.range : '1y',
      createdAt: isKey(h.createdAt) ? h.createdAt : todayKey(),
      order: Number.isFinite(h.order) ? h.order : i,
    });
  });

  let entryCount = 0, tickCount = 0, dropped = 0;
  const entries = {};
  for (const id in raw.entries) {
    if (!seen.has(id)) { dropped++; continue; }          // orphaned entries
    const src = raw.entries[id];
    if (!src || typeof src !== 'object') { dropped++; continue; }
    const dst = {};
    for (const k in src) {
      const n = src[k];
      if (!isKey(k)) { dropped++; continue; }
      if (!Number.isInteger(n) || n < 0) { dropped++; continue; }
      if (n === 0) continue;                              // sparse by definition
      dst[k] = Math.min(999, n);
      entryCount++;
      tickCount += dst[k];
    }
    entries[id] = dst;
  }
  habits.forEach(h => { if (!entries[h.id]) entries[h.id] = {}; });
  if (dropped) warnings.push(dropped + ' malformed entr' + (dropped === 1 ? 'y was' : 'ies were') + ' skipped.');

  const data = {
    schema: storage.SCHEMA,
    onboarded: true,
    username: typeof raw.username === 'string' ? raw.username.slice(0, 32) : '',
    settings: Object.assign(storage.defaultState().settings, raw.settings || {}),
    habits,
    entries,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data,
    counts: { habits: habits.length, days: entryCount, ticks: tickCount },
  };
}

function sanitiseIcon(icon) {
  if (!icon || typeof icon !== 'object') return { type: 'letter', value: 'H' };
  const type = ['svg', 'emoji', 'letter'].indexOf(icon.type) >= 0 ? icon.type : 'letter';
  let value = typeof icon.value === 'string' ? icon.value : 'H';
  if (type === 'svg') value = value.replace(/[^a-z-]/g, '').slice(0, 24) || 'check';
  if (type === 'letter') value = value.slice(0, 1).toUpperCase() || 'H';
  if (type === 'emoji') value = Array.from(value)[0] || '⭐';
  return { type, value };
}

// -- applying an import ------------------------------------------------------

export function replaceAll(data) {
  storage.backup();
  state.adopt(data);
}

/** Union of entries; habits matched by id; conflicting counts take the higher
 *  value, because a tick you recorded somewhere is a tick you did. */
export function merge(data) {
  storage.backup();
  const current = state.get();
  const byId = new Map(current.habits.map(h => [h.id, h]));
  const habits = current.habits.slice();

  data.habits.forEach((incoming) => {
    const mine = byId.get(incoming.id);
    if (!mine) {
      habits.push(Object.assign({}, incoming, { order: habits.length }));
    } else if (incoming.createdAt < mine.createdAt) {
      mine.createdAt = incoming.createdAt;               // keep the earlier start
    }
  });

  const entries = {};
  habits.forEach((h) => {
    const a = current.entries[h.id] || {};
    const b = data.entries[h.id] || {};
    const out = Object.assign({}, a);
    for (const k in b) out[k] = Math.max(out[k] || 0, b[k]);
    entries[h.id] = out;
  });

  state.adopt({
    schema: storage.SCHEMA,
    onboarded: true,
    username: current.username || data.username,
    settings: current.settings,
    habits,
    entries,
  });
}

export function hasBackup() {
  return storage.readBackup() !== null;
}

export function restoreBackup() {
  const backup = storage.readBackup();
  if (!backup) return false;
  state.adopt(backup);
  storage.clearBackup();
  return true;
}

/** Reads a File and parses it. Rejects with a readable message. */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file chosen.')); return; }
    if (file.size > 20 * 1024 * 1024) { reject(new Error('That file is too large to be an export.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (err) {
        reject(new Error('That file is not valid JSON.'));
      }
    };
    reader.readAsText(file);
  });
}
