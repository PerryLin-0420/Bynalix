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
- Historical visualization
- Correlation analysis
- Custom exercises & foods
- App lock — PIN and biometric unlock (Android)
- Encrypted CSV export (password-protected, AES-256)
- Full database export / import for backup & restore
- Offline-first
- Dual-language support (English / Chinese)

---

## Changelog

### v1.4.2
- **Patterns tab** — removed the Z-score normalized trend chart (superseded by the trend chips and correlation network)
- **Correlation network** — lag arrowheads are no longer hidden beneath the target nodes; edges are trimmed back to each node's rim so the direction arrow stays fully visible

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

### Android
- Download APK from Releases
- Install via sideloading

### Windows
- Download `.exe` release package

## Roadmap

- UI refinement (performance + readability)
- More analytics tools (correlation, trend, automatic directed factor relationship network)
- Better visualization
- Additional languages
- Advanced export system
- Database-at-rest encryption (SQLCipher, key derived from PIN / biometric)

## License

Bynálix is open source under the [Apache License 2.0](./LICENSE).

You are free to use, modify, and distribute this software for any purpose, including commercial use, subject to the terms of the Apache 2.0 license.