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