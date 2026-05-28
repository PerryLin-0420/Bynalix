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
- More analytics tools (correlation, trend, clustering)
- Better visualization
- Additional languages
- Advanced export system
- Database-at-rest encryption (SQLCipher, key derived from PIN / biometric)

## License

Bynálix is source-available under the Business Source License 1.1 (BUSL).

- Personal and non-commercial use is allowed
- Commercial use requires explicit permission
- Commercial licensing is available upon request

Each release automatically converts to Apache License 2.0 four years after its official release date.

See LICENSE for full details.