// stats.js — streaks and totals, computed on demand and memoised per habit.
// The cache key carries the habit write version, so any tick invalidates it.

import { todayKey, addDays, diffDays, parseKey } from './dates.js';
import * as state from './state.js';

const cache = new Map();
const RECENT_WINDOW = 30;        // days behind today for the "recently" figure
const WEEKDAY_MIN = 14;          // completed days before a best weekday means much

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
  return {
    current: 0, longest: 0, completions: 0, ticks: 0, rate: 0, days: 1,
    todayCount: 0, doneToday: false, lastTick: null, sinceTick: null,
    recentDone: 0, recentDays: 0, recentRate: 0, bestWeekday: null,
  };
}

function compute(h) {
  const map = state.entries(h.id);
  const today = todayKey();
  const target = h.target;

  let ticks = 0;
  let lastTick = null;              // most recent day with any tick at all
  const done = [];                  // date keys that reached the target
  for (const k in map) {
    ticks += map[k];
    if (k > (lastTick || '')) lastTick = k;
    if (map[k] >= target) done.push(k);
  }
  done.sort();

  // Longest run of consecutive completed days, and a weekday tally along the way.
  const weekdayDone = [0, 0, 0, 0, 0, 0, 0];
  let longest = 0, run = 0, prev = null;
  for (let i = 0; i < done.length; i++) {
    run = (prev && diffDays(prev, done[i]) === 1) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = done[i];
    weekdayDone[parseKey(done[i]).getDay()]++;
  }

  // Current streak counts back from today, or from yesterday when today is not
  // done yet, so the number does not read zero every morning before coffee.
  const doneSet = new Set(done);
  let cursor = doneSet.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (doneSet.has(cursor)) { current++; cursor = addDays(cursor, -1); }

  const days = Math.max(1, diffDays(h.createdAt, today) + 1);
  const todayCount = map[today] || 0;

  // A trailing window says more about now than a lifetime average does.
  const recentDays = Math.min(RECENT_WINDOW, days);
  const recentFrom = addDays(today, -(recentDays - 1));
  let recentDone = 0;
  for (let i = 0; i < done.length; i++) if (done[i] >= recentFrom) recentDone++;

  return {
    current,
    longest: Math.max(longest, current),
    completions: done.length,
    ticks,
    days,
    rate: Math.min(1, done.length / days),
    todayCount,
    doneToday: todayCount >= target,
    lastTick,
    sinceTick: lastTick ? diffDays(lastTick, today) : null,
    recentDone,
    recentDays,
    recentRate: recentDays ? Math.min(1, recentDone / recentDays) : 0,
    bestWeekday: bestWeekday(h, days, done.length, weekdayDone),
  };
}

/** Which day of the week actually gets done, measured against how often that
 *  weekday has come round. Withheld until there is enough history to mean it. */
function bestWeekday(h, days, completions, weekdayDone) {
  if (completions < WEEKDAY_MIN) return null;
  const firstWd = parseKey(h.createdAt).getDay();
  const base = Math.floor(days / 7), remainder = days % 7;
  let best = null;
  for (let wd = 0; wd < 7; wd++) {
    const chances = base + (((wd - firstWd + 7) % 7) < remainder ? 1 : 0);
    if (chances < 2) continue;
    const rate = Math.min(1, weekdayDone[wd] / chances);
    if (!best || rate > best.rate) best = { index: wd, rate, done: weekdayDone[wd], chances };
  }
  return best;
}
