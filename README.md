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

### Tracking
- **Food** — meals built from a searchable food library, custom meal types, reusable meal templates and saved favourite meals; a custom-food editor storing nutrition against a base quantity and unit (100 g by default) that any logged amount scales from, and drinks logged in ml can count toward the day's water automatically; category and aggregate tag filters (starch / protein / fat / favourites) with paging
- **Exercise** — strength logged as sets × reps × weight by body part; interval-based cardio (running, swimming, cycling) with distance, duration and pace; other activities by duration and intensity. Calorie burn is estimated from lean body mass where body fat is known, and from body weight otherwise
- **Body** — weight, body fat, skeletal muscle with segmental distribution, body water, visceral fat level, waist
- **Sleep** — duration, quality and notes, with automatic detection of the overnight sleep window from screen activity on Android
- **Water** — daily intake against a hydration goal

### Goals
- Eight modes — three cut rates, three bulk rates, maintenance, and fully custom
- Calorie and macronutrient targets derived from BMR, NEAT and TDEE (Mifflin-St Jeor, or Katch-McArdle once body fat is known). Lean body mass is stored from a measured body-fat reading rather than drifting with day-to-day weight
- Custom mode adds a free-form goal metric — any strength, cardio, body, diet or burn measure — with up to five variables scored against it

### Analysis
- **History** — weight, calories, macros, water, sleep, strength volume, per-exercise max, exercise distribution, activity burn and body composition over any range, with optional trend-line fitting and slope per week
- **Correlation** — an influence ranking against your goal, plus a variable relationship network built on day-over-day changes (Spearman) with a 0–3 day lag search, so a shared trend cannot manufacture a link
- **Patterns** — weekend-vs-weekday effects, significance gated; and relationship changes, which tells a link that has always held apart from one that measurably started partway through the record
- **Stability** — a seven-axis star chart scoring how little weight, calories, the three macros, water and sleep wobble day to day, independent of any long-term trend
- Every result carries its sample size and data density, and says "not enough data" rather than showing a number it cannot stand behind

### Output
- Any chart can be saved as an image, stamped with the export date
- Encrypted CSV export of every table (AES-256 ZIP)
- Full database export and import, for backup or moving to another device

### Privacy & platform
- Local-first — SQLite on your own device. No account, no server, no telemetry
- Works fully offline
- App lock with a password, plus biometric unlock on Android
- Android, Windows, macOS, and an unsigned iOS build for sideloading
- English and 繁體中文 throughout

---

## Changelog

Full history: **[CHANGELOG.md](./CHANGELOG.md)** · [繁體中文](./CHANGELOG-TW.md)

**Latest — v1.6.2**
- Every chart can be saved as an image, stamped with the export date
- Meal spacing — eating window and longest gap — joins the correlation network
- Relationship changes now says when a range is too short to test, instead of implying it found nothing
- Stability's explanation moved into its own collapsible card; the density wedge is gone from the plot area
- Fixes: the in-app version number, and food search scroll position on page change

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