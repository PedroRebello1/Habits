# Habit Grid

A local-first habit tracker: nothing but the grid. No tasks, no plans, no accounts, no server.
Static site, installable as an app, works offline.

Built to [`habit-grid-plan.md`](habit-grid-plan.md).

---

## Running it

There is no build step. Any static file server will do:

```sh
python -m http.server 8000
# then open http://127.0.0.1:8000/
```

Opening `index.html` straight off disk (`file://`) will not work — ES modules and
service workers both need an origin.

## Deploying to GitHub Pages

Push the folder and turn Pages on for the branch. Every path in the app is relative
(`./sw.js`, `./styles.css`), so it works from `https://<user>.github.io/<repo>/` without
any config. `.nojekyll` stops Jekyll swallowing folders.

## Installing on Android

Open the site in Chrome and use **Install app** (or the "Add to Home screen" button in
onboarding, and in Settings). It then runs fullscreen, offline, with its own icon.

Installing matters for more than convenience: an installed app's storage is far less
likely to be evicted by the browser than a tab you visited once.

## Where the data lives

One `localStorage` key, `habitgrid.v1`, on your device. That is the whole story — there
is no sync, no backup and no copy anywhere else. Clearing site data erases it.

The privacy claim is structural rather than promised. `index.html` ships this header:

```
default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'self' data:
```

`connect-src 'none'` means the app *cannot* make a network request — no fetch, no XHR,
no beacon — even by accident. Confirmed in testing: a `fetch()` from the page is blocked
by the browser.

Export from Settings now and then. The home screen nags after 30 days without one.

---

## Layout

```
index.html            app shell + the inlined SVG sprite (36 habit icons, 12 UI glyphs)
styles.css            tokens, layout, grid, sheets
js/dates.js           local YYYY-MM-DD maths — the only date model in the app
js/storage.js         localStorage, debounced writes, quota handling, cross-tab events
js/state.js           in-memory store, subscribe/notify, undo snapshots
js/stats.js           streaks, totals, rates — memoised per habit
js/grid.js            layout planning, three cell units, windowed rendering
js/views.js           screens, sheets, toasts
js/io.js              export, import, validation, backup
js/main.js            router, boot, lifecycle listeners
icons/make-icons.py   regenerates the PWA icons (standard library only)
manifest.webmanifest  installability
sw.js                 offline shell
```

## Notes on the build

Four decisions differ from the plan, each for a reason:

**`style-src 'self' 'unsafe-inline'` was added to the CSP.** The plan's `default-src 'self'`
alone blocks `style` attributes, and the grid sets a per-cell fill level through one. The
privacy guarantee rides on `connect-src 'none'` and `script-src 'self'`; CSS cannot exfiltrate
anything with `img-src` pinned to self.

**System font stacks instead of self-hosted woff2 subsets.** A high-contrast serif for the
display face, a tabular mono for figures, the system UI stack for controls. Zero bytes, zero
requests. Swap in real `@font-face` files later without touching anything but `styles.css`.

**The five-year view slices each year into 52 seven-day slots from 1 January**, with the last
slot absorbing the remainder, rather than aligning to week starts. It keeps the 13 × 4 block
exact and means the 53rd-week drift never opens a gap or double-counts a day.

**Backfilling a day before a habit existed moves its start date back**, so the completion rate
does not quietly lie when you record history you already had. Those days render as ghost
outlines until you fill them.

## What it does

- Multiple habits, each with its own contribution grid, colour, icon and daily target
- Targets above 1 fill the cell in steps; a day only counts toward a streak at the full target
- Per-habit range from one week to all time, with the cell unit changing to suit — days, then
  weeks, then months. Ten years fits on one screen
- Tap to tick, tap a full cell to clear it, long-press for an exact stepper
- Week view for "I forgot to tick Tuesday"
- Aggregate cells cannot be ticked; tapping one opens that week or month at day level
- Full keyboard grid navigation, real `aria-label`s on every cell, reduced-motion support
- Export / import JSON, with merge or replace, validation, and a recoverable backup
- Delete gets a confirmation naming the habit and a ten-second undo

## Tested

Driven through headless Chrome at 390 × 844 with touch emulation: onboarding, habit
creation, ticking, all nine ranges and three cell units, virtualization, keyboard
navigation, long-press, delete with undo, import merge and replace, backup restore,
cross-tab sync, quota failure, and an offline reload with the network cut. Streak and
date maths have unit tests, including DST boundaries and target re-scoring.
