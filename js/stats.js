// stats.js — streaks and totals, computed on demand and memoised per habit.
// The cache key carries the habit write version, so any tick invalidates it.

import { todayKey, addDays, diffDays } from './dates.js';
import * as state from './state.js';

const cache = new Map();

export function statsFor(habitId) {
  const h = state.habit(habitId);
  if (!h) return empty();
  const key = habitId + ':' + state.versionOf(habitId) + ':' + h.target + ':' + todayKey();
  const hit = cache.get(habitId);
  if (hit && hit.key === key) return hit.value;
  const value = compute(h);
  cache.set(habitId, { key, value });
  return value;
}

export function invalidate(habitId) {
  if (habitId) cache.delete(habitId); else cache.clear();
}

function empty() {
  return { current: 0, longest: 0, completions: 0, ticks: 0, rate: 0, days: 1, todayCount: 0, doneToday: false };
}

function compute(h) {
  const map = state.entries(h.id);
  const today = todayKey();
  const target = h.target;

  let ticks = 0;
  const done = [];                         // date keys that reached the target
  for (const k in map) {
    ticks += map[k];
    if (map[k] >= target) done.push(k);
  }
  done.sort();

  // Longest run of consecutive completed days.
  let longest = 0, run = 0, prev = null;
  for (let i = 0; i < done.length; i++) {
    run = (prev && diffDays(prev, done[i]) === 1) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = done[i];
  }

  // Current streak counts back from today, or from yesterday when today is not
  // done yet, so the number does not read zero every morning before coffee.
  const doneSet = new Set(done);
  let cursor = doneSet.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (doneSet.has(cursor)) { current++; cursor = addDays(cursor, -1); }

  const days = Math.max(1, diffDays(h.createdAt, today) + 1);
  const todayCount = map[today] || 0;

  return {
    current,
    longest: Math.max(longest, current),
    completions: done.length,
    ticks,
    days,
    rate: Math.min(1, done.length / days),
    todayCount,
    doneToday: todayCount >= target,
  };
}
