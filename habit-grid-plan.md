# Habit Grid — Full Build Plan

A local-first habit tracker: nothing but the grid. No tasks, no plans, no accounts, no server.
Static site, hosted on GitHub Pages, installable as an app, works offline.

---

## 1. Scope

**In v1**

- Multiple habits, each with a GitHub-style contribution grid
- Per-habit daily target (frequency). 1 tick fills the cell; a target of 4 fills it in 4 steps of increasing intensity
- Tick today from the card; tap any past day in the grid to tick it; week view for the last 7 days
- Per-habit grid range: 1 week → 10 years → all time
- Real SVG icons that inherit the habit's colour, plus emoji and single-letter options
- Streaks and completion stats
- Export / import JSON
- Username, stored only on the device
- Installable PWA, fully offline

**Out**

- Tasks, notes, reminders, notifications
- Accounts, sync, cloud, analytics, any network request at all
- Measurable habits (distance, weight, time) — the target-count model covers "3 glasses of water", which is the common case
- Archiving. Delete is delete.

---

## 2. Stack and file layout

Vanilla HTML, CSS and ES modules. No build step, no framework, no CDN — you push the folder and it runs.
A strict CSP header makes the privacy promise structural rather than a claim.

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data:; connect-src 'none'">
```

`connect-src 'none'` means the app *cannot* phone home, even by accident.

```
index.html            app shell + inlined SVG sprite
styles.css            tokens, layout, grid
fonts/                two self-hosted woff2 subsets
icons/                PWA icons (192, 512, maskable)
js/
  storage.js          localStorage read/write, debounce, quota handling
  state.js            in-memory store, subscribe/notify, undo snapshots
  dates.js            local date keys, week math, range expansion
  grid.js             cell rendering, density modes, virtualization
  views.js            screens: home, week, detail, edit, settings
  stats.js            streaks, totals, rates (memoised)
  io.js               export, import, validation, backup
  main.js             router, boot, lifecycle listeners
manifest.webmanifest
sw.js
.nojekyll
```

**GitHub Pages note:** the site lives at `/<repo>/`, so every path must be relative (`./sw.js`, `./styles.css`).
An absolute `/sw.js` silently breaks the service worker scope. `.nojekyll` stops Jekyll eating folders that start with `_`.

---

## 3. Data model

One localStorage key, `habitgrid.v1`:

```js
{
  schema: 1,
  username: "clara",
  settings: {
    weekStart: 1,            // 1 = Monday, 0 = Sunday
    theme: "dark",
    defaultRange: "1y",
    lastExport: "2026-08-01"
  },
  habits: [{
    id: "h_a1b2c3",
    name: "Read",
    icon: { type: "svg", value: "book" },   // or {type:"emoji",value:"📚"} / {type:"letter",value:"R"}
    color: "#C6A15B",
    target: 1,               // ticks needed per day for a full cell
    range: "1y",             // this habit's grid window
    createdAt: "2026-04-01",
    order: 0
  }],
  entries: {
    "h_a1b2c3": { "2026-08-19": 1, "2026-08-18": 3 }   // date -> tick count
  }
}
```

Sparse entries: only days with at least one tick are stored. Ten habits over a year is roughly 60 KB, far under the ~5 MB limit. Even a decade of daily ticks across ten habits stays under 1 MB.

**Date keys are local `YYYY-MM-DD`, built from `getFullYear/getMonth/getDate`.** Never `toISOString()` — it converts to UTC and will silently record the wrong day for anyone west of Greenwich in the evening, or east of it in the morning.

---

## 4. Frequency and intensity

Each habit has a `target`: how many ticks make a day complete. Default 1.

- `target: 1` — one tick, cell fills solid.
- `target: 4` — each tick adds a quarter. 2/4 renders at half intensity.

Fill is computed as `level = min(count / target, 1)`, then mapped to a colour by mixing the habit colour into the empty-cell colour rather than dropping opacity:

```css
background: color-mix(in oklab, var(--habit) calc(var(--level) * 70% + 30%), var(--cell-empty));
```

Mixing from a 30% floor means a 1/5 tick is still clearly visible on a dark background; raw `opacity: 0.2` would disappear. The mix runs in oklab so mid-steps stay perceptually even instead of muddying.

**Interaction**

| Gesture | Result |
|---|---|
| Tap the today button | +1 tick, shows `2/4` while target > 1 |
| Tap a grid cell | +1 tick on that day |
| Tap a full cell | resets that day to 0 |
| Long-press a cell | opens a small stepper (− count +) for exact edits |

So a single-target habit is a plain toggle, and a multi-target habit cycles 0 → 1 → 2 → 3 → 4 → 0.

**A day counts toward a streak only when `count >= target`.** Partial days show in the grid but don't extend the streak.

**Changing the target later** re-scores history: a day with 2 ticks reads as complete at target 2 and as half at target 4. The edit sheet says so plainly before saving. The alternative — storing the target alongside every entry — doubles storage and makes "I meant to do 3 all along" impossible to fix. Recomputing is the honest default.

---

## 5. The grid

Seven rows (days of the week), one column per week, `grid-auto-flow: column`. Month labels sit above the first column of each month; a hairline rule separates years.

### Ranges

Selectable per habit, with a global default in settings:

`1 week · 1 month · 3 months · 6 months · 1 year · 2 years · 5 years · 10 years · All time`

### Density modes

Ten years of day cells is 3,650 squares per habit — unreadable at any size that fits a phone, and 36,000 DOM nodes across ten habits. So the cell unit changes with the range. Auto-selected, overridable in settings.

| Range | Cell unit | Cell size | Layout |
|---|---|---|---|
| 1 week | day | 40 px | fits screen, weekday labels below |
| 1 month | day | 24 px | fits screen |
| 3 months | day | 15 px | fits most phones |
| 6 months | day | 13 px | horizontal scroll |
| 1 year | day | 11 px | horizontal scroll |
| 2 years | day | 9 px | scroll + virtualized |
| 5 years | week | 12 px | 13 columns × 4 rows per year, year rules between |
| 10 years | month | 22 px | 12 columns × 10 rows — the whole decade on one screen |
| All time | auto | — | picks the mode that fits `createdAt` → today |

In **week mode** a cell is one week, intensity = completed days ÷ 7. In **month mode** a cell is one month, intensity = completed days ÷ days in month. Both are aggregates of the same daily data, so switching range never changes what's stored. Week mode packs 52 weeks per year block and ignores the 53rd-week drift; the label says "≈" nowhere, it just reads as a year block, which is what people want from a decade view.

Aggregate cells are read-only. Tapping one zooms into that week or month at day density rather than trying to tick it — you can't tick "March".

### Virtualization

Columns are fixed width, so the visible range is arithmetic, not measurement: `startCol = floor(scrollLeft / colWidth)`. Render visible columns plus 8 of buffer either side, recycle nodes on scroll, `content-visibility: auto` on each card as a second line of defence. Two years of day cells becomes ~30 live columns instead of 105.

Grid scroll position pins to the right (today) on load.

### Accessibility

Each interactive cell is a real `<button>` with `aria-label="19 August — 2 of 4 done"`. Roving tabindex plus arrow-key navigation across the grid. Visible brass focus ring. `prefers-reduced-motion` kills the fill animation.

---

## 6. Icons

An inline SVG sprite, injected at the top of `index.html` in a hidden `<div>`:

```html
<svg hidden><symbol id="i-book" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.75" stroke-linecap="round">…</symbol></svg>
```

Used as `<svg class="habit-icon"><use href="#i-book"/></svg>`, inside a wrapper carrying `style="color: var(--habit)"`. Because every path is `stroke="currentColor"`, **changing the habit colour recolours the icon with no extra code** — one CSS custom property drives the cell fill, the icon, the streak flame and the card's tinted halo.

Sprite is inlined rather than loaded from `icons.svg` because cross-file `<use href="file.svg#id">` needs a same-origin fetch, which fails from `file://` and adds a request the CSP would have to allow.

**Set: 36 icons, six groups**

- *Movement* — run, walk, bike, swim, dumbbell, stretch
- *Body* — water, sleep, pill, apple, tooth, heart
- *Mind* — book, pen, headphones, brain, sun, lotus
- *Craft* — code, camera, brush, guitar, tools, plant
- *Home* — broom, laundry, dish, wallet, bed, phone-down
- *Discipline* — no-smoking, no-drink, no-sugar, no-screen, flame, check

**Alternatives kept:** an emoji picker (the OS set, zero bytes) and a single letter, set in the display face and coloured with the habit colour. All three live under one `icon: {type, value}` field, so the picker is three tabs over one control.

**Colours:** 12 swatches tuned for the dark background, plus a native `<input type="color">` for anything else. All swatches pass 3:1 against the card background at full intensity.

---

## 7. Screens

**Onboarding** — one screen. Username field, one honest line about where data lives, "Add to Home Screen" prompt, Start.

**Home** — habit cards. Each: icon, name, streak, today's tick button (`2/4` when target > 1), then the grid. Bottom toggle switches Grid / Week. FAB adds a habit. Long-press-drag reorders.

**Week view** — rows are habits, columns are the last 7 days with weekday letters and dates. Every cell tappable. This is the fast path for "I forgot to tick Tuesday".

**Habit detail** — full grid, range selector, stats block, edit, delete.

**Add / edit habit** — one screen, not a wizard: name, icon (svg / emoji / letter tabs), colour, target stepper, range. Live preview card at the top updates as you change things.

**Settings** — username, week start, theme, default range, default density override, export, import, delete everything.

---

## 8. Stats

- **Current streak** — counts back from today; if today isn't done yet it counts back from yesterday, so the number doesn't reset to zero every morning before you've had coffee
- **Longest streak**
- **Total completions** and **total ticks** (they differ when target > 1)
- **Completion rate** since `createdAt`

Computed on demand, memoised per habit, invalidated on any write to that habit.

---

## 9. Export and import

**Export** — `Blob` → `URL.createObjectURL` → `<a download>`, named `habitgrid-clara-2026-08-19.json`, plus a "copy to clipboard" fallback because iOS Safari downloads are unreliable. Writes `settings.lastExport`.

**Import** — file picker, then validate before touching anything: schema version, habit ID shape, date-key format, counts are integers ≥ 0. Two modes:

- **Replace** — wipe and load
- **Merge** — union of entries, habits matched by `id`, conflicting counts resolved to the higher value

Either way the current data is snapshotted to `habitgrid.backup` first, recoverable from Settings until the next import.

---

## 10. Design direction

The subject is accumulation — a decade of small marks. That's a **ledger**, not a dashboard, and the design leans there: warm near-black paper, hairline rules dividing months and years, tabular figures, restraint everywhere except the grid itself.

**Colour**

```
--ink-900  #131210   page (warm black, not blue-black)
--ink-800  #1C1A17   card
--ink-600  #2A2622   empty cell
--chalk    #EDE7DA   primary text
--chalk-dim#9A9186   secondary text
--brass    #C6A15B   UI accent: focus, today marker, active tab
--habit    per habit, drives cells + icon + halo
```

**Type** — self-hosted woff2 subsets, no CDN. Display: a high-contrast serif for the app title, habit names and streak numbers. Numerals and grid labels: a mono with tabular figures, so date columns don't jitter. Body and controls: the system UI stack, which costs nothing and feels native on both platforms.

**Signature** — the today column: a full-height brass hairline running through every habit's grid on the home screen, so all your cards align on the same vertical "now". It's the one flourish; everything else stays quiet.

Explicitly avoided: the neon-green-on-black look every habit app defaults to, gradient hero cards, and progress rings.

---

## 11. Edge cases handled in v1

- **iOS 7-day eviction** — Safari clears localStorage for non-installed sites after seven days without a visit. Mitigations: push "Add to Home Screen" during onboarding, and surface a quiet export nudge when `lastExport` is over 30 days old.
- **Midnight rollover** — recompute "today" on `visibilitychange` and `focus`, so a tab left open overnight doesn't tick yesterday.
- **Multiple tabs** — listen for the `storage` event and reload state.
- **Quota or write failure** — `setItem` wrapped in try/catch, real error surfaced; a tick never disappears silently.
- **Debounced writes** — 200 ms, with a forced flush on `pagehide`.
- **Delete** — confirmation sheet naming the habit and its total tick count, then a 10-second undo toast holding an in-memory snapshot. After that it is genuinely gone, including its entries.
- **DST** — all date maths on local `YYYY-MM-DD` strings, never on epoch arithmetic, so the 23-hour and 25-hour days don't skip or duplicate a cell.

---

## 12. Build order

Each step ends with something deployable.

1. `dates.js`, `storage.js`, `state.js` — data layer, no UI
2. Grid rendering at day density + tick toggle, one hardcoded habit
3. Frequency: targets, intensity mixing, stepper
4. Habit CRUD, icon/colour/target editor, sprite
5. Ranges and density modes, virtualization
6. Week view, stats, habit detail
7. Export, import, backup
8. Manifest, service worker, icons, offline test
9. Polish: onboarding, empty states, a11y pass, reduced motion, keyboard grid nav

---

## 13. Deferred, deliberately

- Weekly goals ("4 times a week") — a different completion model; the daily target covers most cases
- Multi-tick timestamps (when in the day each tick happened)
- Notes attached to a day
- Heatmap sharing as PNG
- Light theme, if the ledger direction proves it isn't needed
