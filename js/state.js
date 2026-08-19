// state.js — the single in-memory store. Every mutation goes through here,
// bumps a version counter (which invalidates memoised stats) and schedules a
// debounced write.

import * as storage from './storage.js';
import { todayKey, RANGE_IDS } from './dates.js';

let state = storage.defaultState();
let loadedFromDisk = false;
const subscribers = new Set();

const versions = new Map();   // habitId -> write counter, for stats memoisation
let globalVersion = 0;

export function boot() {
  const stored = storage.read();
  if (stored) { state = stored; loadedFromDisk = true; }
  return state;
}

export function isFresh() { return !loadedFromDisk || !state.onboarded; }
export function get() { return state; }
export function settings() { return state.settings; }

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function touch(habitId) {
  globalVersion++;
  if (habitId) versions.set(habitId, (versions.get(habitId) || 0) + 1);
  else state.habits.forEach(h => versions.set(h.id, (versions.get(h.id) || 0) + 1));
}

function commit(habitId, detail) {
  touch(habitId);
  storage.write(state);
  const payload = Object.assign({ habitId }, detail || {});
  subscribers.forEach(fn => fn(payload));
}

export function versionOf(habitId) { return versions.get(habitId) || 0; }
export function version() { return globalVersion; }

/** Replaces the whole store — import, backup restore, another tab writing. */
export function adopt(next, opts) {
  const persist = !opts || opts.persist !== false;
  state = storage.normalise(next);
  loadedFromDisk = true;
  touch(null);
  if (persist) { storage.write(state); storage.flush(); }
  subscribers.forEach(fn => fn({ wholesale: true }));
}

// -- Habits ------------------------------------------------------------------

export function habits() {
  return state.habits.slice().sort((a, b) => a.order - b.order);
}

export function habit(id) {
  return state.habits.find(h => h.id === id) || null;
}

export function newId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'h_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function addHabit(fields) {
  const h = {
    id: newId(),
    name: (fields.name || 'Untitled').trim().slice(0, 40),
    icon: fields.icon || { type: 'letter', value: 'H' },
    color: fields.color || '#C6A15B',
    target: Math.max(1, Math.min(20, Math.round(fields.target || 1))),
    range: RANGE_IDS.indexOf(fields.range) >= 0 ? fields.range : state.settings.defaultRange,
    createdAt: fields.createdAt || todayKey(),
    order: state.habits.length,
  };
  state.habits.push(h);
  state.entries[h.id] = {};
  commit(h.id, { added: true });
  return h;
}

export function updateHabit(id, patch) {
  const h = habit(id);
  if (!h) return null;
  if (patch.name !== undefined) h.name = String(patch.name).trim().slice(0, 40) || h.name;
  if (patch.icon !== undefined) h.icon = patch.icon;
  if (patch.color !== undefined) h.color = patch.color;
  if (patch.target !== undefined) h.target = Math.max(1, Math.min(20, Math.round(patch.target)));
  if (patch.range !== undefined && RANGE_IDS.indexOf(patch.range) >= 0) h.range = patch.range;
  commit(id, { updated: true });
  return h;
}

/** Removes the habit and its entries, returning a snapshot for undo. */
export function deleteHabit(id) {
  const index = state.habits.findIndex(h => h.id === id);
  if (index < 0) return null;
  const snapshot = {
    habit: Object.assign({}, state.habits[index]),
    entries: Object.assign({}, state.entries[id] || {}),
    index,
  };
  state.habits.splice(index, 1);
  delete state.entries[id];
  state.habits.forEach((h, i) => { h.order = i; });
  commit(id, { deleted: true });
  return snapshot;
}

export function restore(snapshot) {
  if (!snapshot) return;
  state.habits.splice(Math.min(snapshot.index, state.habits.length), 0, snapshot.habit);
  state.entries[snapshot.habit.id] = snapshot.entries;
  state.habits.forEach((h, i) => { h.order = i; });
  commit(snapshot.habit.id, { restored: true });
}

export function moveHabit(id, toIndex) {
  const list = habits();
  const from = list.findIndex(h => h.id === id);
  if (from < 0 || toIndex < 0 || toIndex >= list.length || from === toIndex) return;
  const moved = list.splice(from, 1)[0];
  list.splice(toIndex, 0, moved);
  list.forEach((h, i) => { h.order = i; });
  commit(null, { reordered: true });
}

// -- Entries -----------------------------------------------------------------

export function entries(habitId) {
  if (!state.entries[habitId]) state.entries[habitId] = {};
  return state.entries[habitId];
}

export function count(habitId, dateKey) {
  const map = state.entries[habitId];
  return (map && map[dateKey]) || 0;
}

export function setCount(habitId, dateKey, n) {
  const map = entries(habitId);
  const next = Math.max(0, Math.min(999, Math.round(n)));
  if (next === 0) delete map[dateKey];      // sparse: zero days are simply absent
  else map[dateKey] = next;
  commit(habitId, { dateKey, ticked: true });
  return next;
}

/** Backfilling a day before the habit existed moves its start date back, so
 *  the completion rate keeps telling the truth. Committed as a tick so the
 *  screen refreshes in place instead of rebuilding. */
export function extendStart(habitId, dateKey) {
  const h = habit(habitId);
  if (!h || dateKey >= h.createdAt) return;
  h.createdAt = dateKey;
  commit(habitId, { ticked: true });
}

export function bump(habitId, dateKey, delta) {
  return setCount(habitId, dateKey, count(habitId, dateKey) + delta);
}

/** Tap behaviour: 0 -> 1 -> ... -> target -> 0. */
export function cycle(habitId, dateKey) {
  const h = habit(habitId);
  const target = h ? h.target : 1;
  const current = count(habitId, dateKey);
  return setCount(habitId, dateKey, current >= target ? 0 : current + 1);
}

export function totalTicks(habitId) {
  const map = state.entries[habitId] || {};
  let sum = 0;
  for (const k in map) sum += map[k];
  return sum;
}

// -- Settings ----------------------------------------------------------------

export function setSettings(patch) {
  Object.assign(state.settings, patch);
  commit(null, { settings: true });
}

export function setUsername(name) {
  state.username = String(name || '').trim().slice(0, 32);
  commit(null, { settings: true });
}

export function completeOnboarding(name) {
  state.username = String(name || '').trim().slice(0, 32);
  state.onboarded = true;
  loadedFromDisk = true;
  commit(null, { settings: true });
  storage.flush();
}

export function markExported() {
  state.settings.lastExport = todayKey();
  commit(null, { settings: true });
  storage.flush();
}

export function reset() {
  state = storage.defaultState();
  loadedFromDisk = false;
  touch(null);
  storage.wipe();
  subscribers.forEach(fn => fn({ wholesale: true }));
}
