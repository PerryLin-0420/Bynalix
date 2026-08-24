🌐 Language: [English](./README.md) | [繁體中文](./README-TW.md)

# Bynálix

Local-first personal health analytics platform.
Bynálix is designed for long-term self-observation, not engagement optimization.
Track, observe, and analyze your own long-term behavioral data — without relying on opaque cloud AI systems.

---
## Philosophy

Bynálix is not designed to tell users how to live.

Instead, it helps users:
- Record long-term personal data
- Observe behavioral patterns
- Explore correlations
- Understand what actually affects them

The goal is not blind optimization,
but deeper personal understanding through self-owned data.

---

## Features

- Local-first architecture
- SQLite-based structured data storage
- Nutrition tracking (foods, meals, reusable meal templates)
- Workout tracking — strength training (sets & reps) and interval-based cardio
- Body composition tracking (body fat, segmental muscle, body water, visceral fat, waist)
- Goal & mode system (weight, calorie, macronutrient, and hydration targets)
- Sleep & hydration tracking
- Historical visualization, with optional trend-line fitting
- Correlation analysis — variable relationship network with lagged effects
- Pattern discovery — weekend-vs-weekday effects, significance gated
- Timeline — which factors affect your goal long-term, and which only started recently, found by shrinking the analysis window day by day
- Automatic sleep detection from screen activity (Android)
- Custom exercises & foods
- App lock — PIN and biometric unlock (Android)
- Encrypted CSV export (password-protected, AES-256)
- Full database export / import for backup & restore
- Offline-first
- Dual-language support (English / Chinese)

---

## Changelog

### v1.6.0
- **Timeline redesigned around your goal** — the correlation-network diagram is gone from the Timeline tab; the shrinking-window analysis is now backend computation only, scored against your goal variable (weight, in the direction your mode already targets) instead of drawn as a graph. Two results replace it: **Long-term effects** — factors that hold up no matter how the window is sized, including the tightest, most recent one, so the effect isn't an artefact of old data and hasn't gone away since; and **Newly emerged effects** — factors whose link to your goal only started partway through the record and still holds as of your latest data, with the onset date, both periods' r and n, and a search-corrected p-value. Both are split into positive (helps your goal) and negative (hurts it)
- **Catches what a diagram can't** — a relationship strong enough to survive being diluted by old data never visibly "appears" on a frame-by-frame view; only splitting the record into before/since reveals when it actually started. Verified against synthetic records with a seeded change in behavior: the reported onset lands within a day of the true date, while pure-noise records produce a false "newly emerged" finding on only a handful of runs out of dozens
- **Long-term effects now read as a trend, not a single number** — each one gets a Spearman correlation of its own r against window position (the same rank-correlation machinery the network runs, just one level up, reading a correlation's own trajectory instead of two raw variables), reported as strengthening, weakening, or holding steady. Drawn as a waveform rather than asserted by a badge: the raw r-per-window is a thin trace, a centered-moving-average "envelope" over it is the trend line a strengthening or weakening relationship actually shows up as. Verified against hand-built frame sequences with a known monotonic r trajectory (isolating the trend statistic from the window-blending effects a full simulation introduces): both directions recovered with r > 0.97 and p far below 1e-90, and a flat sequence correctly read as "stable"
- **Newly emerged effects can now show more than one turning point** — after the onset date, a second, direction-agnostic search runs within the older "before" period to check whether *it* contains an earlier regime change too (moderate, then quiet, then stronger again, say) rather than one clean switch-on. When found, the chart draws a staircase — one r-level per regime, stepping at each transition, dashed markers at the boundaries — instead of the flat before/since split; most links still resolve to the ordinary two segments. Verified against a calibrated three-regime synthetic scenario (inert → moderate → strong, same sign throughout, so "since" stays the strongest side as the primary search requires): all three segments and both boundary dates recovered with the search-corrected p-values comfortably under the bar, and zero false 3-segment findings across 40 pure-noise runs
- **Across-the-run chart replaced** — now plots how many positive/negative goal-linked factors each analysis window found, instead of the old generic edge-count/mean-|r| reading that no longer matched what the tab does; hover a bar to see which factors
- **~7x cheaper to build** — scoring every window against one fixed goal variable, instead of the full pairwise network, cuts the correlations computed per frame from ~90 pairs to ~13
- **Range picker now matches the rest of Statistics** — the analysis range is picked the same way the Pearson/Advanced/Patterns tabs already do: preset pills or a custom [start, end] on a calendar, reusing that same date-range component. Presets are Timeline-sized (all history / 365 / 180 / 90 days, always ending on your latest data) rather than the other tabs' 14/30/90, since a shrinking-window analysis needs real room to work with; a custom range can pick its own end too, not just its start, and is flagged if it's under the 15-day floor a correlation needs
- **Builds automatically, like every other tab** — picking a range used to require a separate "Analyse" tap before anything showed; now a result appears as soon as a range settles, and picking a different one rebuilds on its own, matching the Pearson/Advanced/Patterns tabs' own "no button, just a default result" model. The manual "analysis granularity" step picker is gone too: the ~7x cheaper goal-scored computation means a one-day step already fits the cost budget for anything under about a year, and the existing auto-widening safety net (the frame count and total days analysed are both capped) already picks a coarser step on its own for a longer range — so the control was only ever letting someone deliberately choose a blurrier result than necessary, not a real choice worth exposing. A manual refresh button remains for forcing a rebuild without changing the range
- **Relationship changes (Patterns tab)** — a new "Analyse" section under the correlation network answers a question the network graph can't: is this edge a relationship that's always held, or one that just started? It re-scores the *entire* pairwise network (not one goal variable) across the same long-to-short window sequence the Timeline tab uses, keeps only pairs that turned on partway through the record and still hold now, and drops anything that holds up across the whole history (weight-and-calories-style long-term stable pairs are excluded by design). The survivors are grouped by hub variable — the node with the most newly-emerged connections — into cards, each with a multi-line chart (r per window, one line per neighbor, a dashed marker at the onset) instead of a flat list; a variable linked to only one other one doesn't get its own card. Not every run produces one — this reports a real event in the data, not a guaranteed finding. Verified on synthetic records with a seeded three-way emergence (all onset dates recovered within days of the truth) and on pure-noise records (a false finding in roughly 1 run in 30, after tightening the significance bar for the much larger ~90-pair search this runs versus the goal-only Timeline scan's ~13)

### v1.5.0
- **Timeline tab** — a new tab beside Patterns that plays the correlation network back as a slideshow. Pick a start date A; the window end stays pinned to your latest logged day, and each frame moves the start forward one step — A→now, A+1→now, A+2→now — down to the shortest window a correlation can stand on (15 days). Playing it back shows which relationships survive as the old data drops away and which only ever lived in it. Step defaults to one day (1/2/3/7/14 available) and the whole run can be set to play in 5, 10, 20 or 40 seconds, with play/pause, frame stepping, looping and a scrubber
- **Stable layout across frames** — every frame is laid out on one ring ordering computed from all frames at once, so a variable keeps its slot for the whole run and the only thing moving on screen is the links themselves. A variable with no link in the current frame is held faded in place rather than removed
- **Per-frame change readout** — each frame lists the links it gained, lost and moved against the previous one, flagging sign flips and changes in lead/lag direction, plus a running comparison against the widest window: links gained and lost, and the shift in mean |r|
- **Turning points** — a card that answers *when* a relationship started, not only that it exists. Every candidate date splits the record in two, and the correlation on everything since it is tested against the correlation on everything before it — Fisher's r-to-z on the difference, so a split with only a scrap of data on one side stops looking like a discovery. The date where the two periods disagree most sharply is reported with both r's, both sample sizes and both period lengths: green when the link holds only from that date through to your latest data, red when it holds only in the data before it. Tapping a row jumps the player to that date's graph. Since every pair is tried against every split and the best one kept, the p-value is Bonferroni-corrected against the whole search — on synthetic records with a seeded change of behaviour the reported date lands within a few days of the truth, while pure-noise records usually produce nothing at all. It also catches what watching the slideshow cannot: a relationship strong enough to survive being diluted by the old data never disappears from the graph, so its onset is invisible frame by frame but obvious in the split
- **Across-the-run chart and persistence strips** — link count and mean |r| plotted against window length (tap a point to jump to that frame), and a strip per variable pair showing exactly which windows it held a link in, with the share of frames it survived. A pair at 100% holds no matter where the window starts; one that only shows on the left lives in the older data
- **Bounded build cost** — the frame count and the total days analysed are both capped, so a multi-year history widens its step instead of running for minutes. Building is chunked with a progress bar and can be cancelled mid-run
- **~12× faster correlation networks** — differencing and lagging were building and re-formatting a `Date` for every value of every variable at every lag, which dominated the whole computation. Days are now integers indexed into dense per-day arrays, ranking reuses shared buffers instead of allocating tuples per call, and each pair's p-value is computed once for the candidate that survives rather than for all seven. Output is unchanged, verified identical across window lengths, gapped data and option variants
- **Readable labels on crowded rings** — with more than 12 variables on the ring, labels shrink slightly and every other label at the top and bottom is pushed further out, so neighbouring names no longer overlap

### v1.4.5
- **Flexible water goal** — the 7-day adherence card's water metric now uses the same 80–110%-of-target band as calories, instead of a one-sided ≥90% floor with no ceiling
- **Macro Balance metric** — new row under Calories on the 7-day adherence card: a day only counts as a hit when protein, carbs and fat are each within 80–110% of their own target, not just total calories
- **Trend lines on by default** — the overview trend-line toggle (History) now starts enabled, with a green check shown on the button when active

### v1.4.4
- **Time-of-day variables** — the correlation network gains *Last meal*, *Workout time* and *Wake time*, so meal and training timing can be correlated against weight, sleep and intake. A last meal after midnight counts as later than one at 23:00 rather than wrapping to earliest; clock-to-clock pairs are skipped as trivially coupled, and each clock keeps only its three strongest links
- **Steadier NEAT / TDEE** — the automatic activity level was derived from a bare 7-day count, so a single quiet week could drop someone from *very active* to *sedentary* and move their TDEE by ~840 kcal overnight. The window now grows with available history (one week minimum, up to four weeks) and weights days by recency, so a week off costs one step instead of four while a genuine change of habit still lands within a couple of weeks. It also no longer requires the app to be opened on a Sunday, and stays out of the way until there is a week of history rather than overwriting a manually chosen level
- **Trend lines on the overview charts** — an opt-in orange dashed fit on weight, calories, water and sleep, with a caption giving the slope per week and how many logged days it used. X is the day offset rather than the array index, so gaps do not distort the slope, and days rendered as 0 because nothing was logged (food, water) are excluded from the fit rather than dragging it down. Needs at least 7 logged days before a line is drawn
- **Bigger, properly centred icon buttons** — the confirm/cancel controls in the strength-set and food-entry editors were ~21px and their glyphs sat high in the button (a bare `<svg>` aligns to the text baseline). New `.icon-btn` / `.icon-btn-lg` classes give flex-centred 36px / 44px targets, applied to all 53 icon-only buttons across the app
- **Advanced stats — strength** — new *Weekly Freq* metric (trailing 7-day count of training days), and an explicit **All parts** option so Volume, Max Weight and Weekly Freq can each be read for one body part or for every part combined. Previously a specific part or exercise had to be picked before a config could be confirmed
- **History — daily water** — water intake chart added between the calorie charts and sleep. The dashed goal line and the pass/fail bar tinting come from your own target in Profile (body weight x ml/kg); with no target set neither is drawn, rather than measuring you against an invented standard

### v1.4.3
- **Training frequency variables** — the correlation network gains *Strength freq* and *Cardio freq*, each a trailing 7-day count of training days (cardio includes general exercise entries). This lets frequency itself be correlated against weight, sleep, intake and the rest, rather than only per-session volume. Days with nothing logged count as non-training days; the first 6 days of a range are skipped while the window fills, and a variable is dropped entirely if the user never trained in range
- **Correlation network layout** — variables with no significant link are no longer drawn on the ring; they're listed as compact chips below the graph, so the ring only carries variables that actually produced a result and the remaining nodes get more room
- **Fewer crossings** — ring positions are no longer a fixed domain-sorted circle. Domains still stay grouped, but the ordering is now chosen by an exhaustive search that minimises edge crossings (on a representative dataset: 13 → 6 crossings)
- **Simpler legend** — dropped the per-domain colour key from the correlation network; which domains appear now depends on what produced a result, so the key changed shape run to run. Only the edge legend (positive / negative / lagged) remains
- **Cleaner edges** — thinner strokes, and edges now bow perpendicular to their chord instead of all bending through the centre, so overlapping chords separate into distinct arcs; long labels no longer clip at the graph edge

### v1.4.2
- **Patterns tab** — removed the Z-score normalized trend chart (superseded by the trend chips and correlation network)
- **Correlation network** — lag arrowheads are no longer hidden beneath the target nodes; edges are trimmed back to each node's rim so the direction arrow stays fully visible
- **Sleep detection** — sleep is now inferred from the *longest* overnight screen-off gap instead of the single most-recent screen-off. Both fell-asleep and woke-up times are derived from actual screen activity, so logging late (dismissing the alarm and picking the phone up later) no longer skews the times; wake time is prefilled from the detected wake-up instead of the moment the form is opened

### v1.4.0
- **Custom foods** — edit existing custom foods (pencil button); macro inputs no longer capped at 100 g
- **Strength calories rework** — per-set MET model scaled by lift-to-bodyweight ratio (3.5 / 5.0 / 6.5 MET); reps drive work time, rest time counted at 2.0 MET; rest between sets can be entered manually or auto-detected from the previous set's log time (shown in green)
- **Dashboard** — exercise burn now includes strength training calories (previously cardio only)
- **Pattern discovery** — correlation network graph on the Patterns tab: variables as nodes, significant Spearman correlations (on day-over-day changes, p < 0.05) as edges; lagged effects drawn as directed arrows; tap a node to focus, tap an edge for the scatter detail
- **Weekly patterns** — weekend-vs-weekday effect cards (e.g. "weekend calories +12% vs weekdays"), Welch t-test gated
- **CI fix** — removed deprecated tsconfig `baseUrl` that was silently aborting type checking

### v1.3.0
- **Sleep redesign** — rebuilt sleep add/edit forms: clock picker for wake-up time (defaults to current time on open) and duration; wake time placed above duration; larger sleep cards display wake time and duration as stacked large numerals
- **Sleep edit modal** — editing now opens a popup dialog instead of inline card expansion
- **Sleep prediction** — Android UsageStatsManager integration reads the system's screen-off history to predict sleep start time (no background service required); opening "Add Sleep" auto-fills duration and shows a green predicted sleep time banner; first-time permission setup guided via amber banner
- **TimePicker consistency** — meal time and water time pickers now show a text label above the picker, matching the sleep form style

### v1.2.1
- **Bug fix** — TDEE activity multipliers corrected to Harris-Benedict standard (1.2–1.9×); previously under-estimated by ~10–50%
- **Nutrition** — fat calorie ratio slider (25–35% of TDEE, default 30%) added to mode settings; macro formula updated: fat = TDEE × ratio, carbs fill remainder
- **Bulk rates** — conservative weekly gain targets: slow 0.10%, normal 0.15%, aggressive 0.25% body weight
- **Body fat** — BF% field in Profile locked after initial setup; updates must go through body comp log or weight entry
- **BF staleness alerts** — app notifies once per threshold (30 / 45 / 75 / 105 / 135 / 165 / 180 days since last BF reading); weight rows show ⚠️ at 30–179 days stale and red tint at 180+ days
- **Sleep** — wake-up time field added; inferred sleep start time calculated from wake time minus duration
- **Code quality** — empty catch blocks in Statistics replaced with logError

### v1.2.0
- **Code architecture** — major internal refactoring: component library (EmptyState, StickyHeader, PillButton, CardHeader, Modal/Dialog/BottomSheet), design token system (spacing, font sizes), and style centralization
- **Bug fix** — cycling history now correctly includes spinning bike (飛輪) entries
- **CI/CD** — automated multi-platform release pipeline via GitHub Actions (Windows / macOS / iOS / Android)

### v1.1.0
- **Trend analysis tab** — z-score normalized trend chart (weight / sleep / calories) with adaptive slope detection and direction indicators
- **Lag analysis** — 3 independent lag sections correlating factors against weight change, sleep change, and calorie change
- **Reliability improvements** — robust z-score (median + MAD), minimum data threshold lowered to 7 days
- **Basic stats** — correlation ranking bar chart added (matching advanced tab)
- **History** — cardio chart uses dual Y-axis (duration left, calories right)
- **Bug fix** — body history drawer transparency resolved

---

## Why Bynálix Exists

Bynálix was created to help users verify ideas using their own long-term data,
instead of relying entirely on generalized internet advice.

---

## Correlation Analysis

Correlation does not imply causation.
Bynálix provides exploratory analytics designed to help users observe potential behavioral patterns over time.

---

## Privacy & Ownership

- No cloud account required
- No data collection
- No ads
- Your data belongs to you
- Optional app lock (PIN / biometric)
- SQLite database export supported
- Local backup & restore supported

---

## Development Environment Requirements

| Tool | Version |
|------|------|
| Node.js | 18+ |
| Rust | stable |
| JDK | 21 (required for Android builds; JDK 25 is not supported) |
| Android SDK | API 24+ |
| NDK | r27 |

---

## Technical Architecture

- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite
- **Backend**: Tauri v2 (Rust)
- **Database**: SQLite (`@tauri-apps/plugin-sql`)
- **Platform detection**: `src/lib/platform.ts`
- **Internationalization**: `src/lib/i18n.ts`

## Installation

Download the latest build from the Releases page:

### Android
- Download the APK from Releases
- Install via sideloading

### Windows
- Download the `.exe` installer

### macOS
- Download the universal `.dmg`

### iOS
- An unsigned `.ipa` is published for sideloading when the build succeeds

## Roadmap

Bynálix stays focused on local-first, long-term self-observation.

Short term:
- UI and performance refinement
- Core data flow and stability

Medium term:
- Stronger visualization and interaction

Long term:
- Fuller personal data export and migration
- Additional languages and cross-platform polish
- Database-at-rest encryption (SQLCipher, key derived from PIN / biometric)

## License

Bynálix is open source under the [Apache License 2.0](./LICENSE).

You are free to use, modify, and distribute this software for any purpose, including commercial use, subject to the terms of the Apache 2.0 license.