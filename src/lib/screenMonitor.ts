import { invoke } from "@tauri-apps/api/core";

export interface SleepWindowResult {
  /** Epoch-ms the user fell asleep, or null if unavailable / stale. */
  sleepStart: number | null;
  /** Epoch-ms the user woke up, or null if unavailable / stale. */
  wakeTime: number | null;
  /**
   * Whether PACKAGE_USAGE_STATS has been granted.
   * - false → user needs to enable the permission in Settings
   * - true  → data is (or will be) available
   * Always false on desktop / web (no impact on UI there).
   */
  hasPermission: boolean;
}

/**
 * Read the detected sleep window (fell-asleep + woke-up timestamps) and
 * permission status written by MainActivity's UsageStatsManager scan.
 *
 * The window is derived from the longest overnight screen-off gap, so both
 * edges reflect the actual sleep rather than when the user opens the app —
 * logging late (e.g. dismissing the alarm and picking the phone up later) no
 * longer skews the times.
 *
 * Returns `hasPermission: false` on non-Android platforms so the UI can
 * skip the permission banner entirely on desktop.
 */
export async function getSleepWindow(): Promise<SleepWindowResult> {
  try {
    const raw = await invoke<{ sleep_start: number; wake_time: number; has_permission: boolean }>(
      "get_last_screen_off"
    );

    // Only trust the window when the wake edge is recent (within 20 h): the
    // user is logging this morning's sleep, not a days-old leftover.
    const wakeAge = Date.now() - raw.wake_time;
    const wakeFresh = raw.wake_time > 0 && wakeAge >= 0 && wakeAge < 20 * 60 * 60_000;
    const startValid = raw.sleep_start > 0 && raw.sleep_start < raw.wake_time;

    return {
      sleepStart: wakeFresh && startValid ? raw.sleep_start : null,
      wakeTime: wakeFresh ? raw.wake_time : null,
      hasPermission: raw.has_permission,
    };
  } catch {
    // Desktop build or command not available
    return { sleepStart: null, wakeTime: null, hasPermission: false };
  }
}

/**
 * Open the Android Usage Access settings page.
 * Uses window.AndroidBridge (injected by MainActivity.onWebViewCreate).
 * No-op on desktop / web.
 */
export function openUsageSettings(): void {
  (window as any).AndroidBridge?.openUsageSettings();
}

/**
 * Re-query UsageStatsManager after the user returns from Settings.
 * Call this when the permission grant flow completes.
 */
export function refreshScreenStats(): void {
  (window as any).AndroidBridge?.refreshScreenStats();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert an epoch-ms timestamp to a local-time "HH:mm" string. */
export function tsToHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
