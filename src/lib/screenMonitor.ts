import { invoke } from "@tauri-apps/api/core";

export interface ScreenMonitorResult {
  /** Epoch-ms of the last screen-off, or null if unavailable / too old. */
  timestamp: number | null;
  /**
   * Whether PACKAGE_USAGE_STATS has been granted.
   * - false → user needs to enable the permission in Settings
   * - true  → data is (or will be) available
   * Always false on desktop / web (no impact on UI there).
   */
  hasPermission: boolean;
}

/**
 * Read the last screen-off timestamp and permission status written by
 * MainActivity's UsageStatsManager query.
 *
 * Returns `hasPermission: false` on non-Android platforms so the UI can
 * skip the permission banner entirely on desktop.
 */
export async function getLastScreenOff(): Promise<ScreenMonitorResult> {
  try {
    const raw = await invoke<{ timestamp: number; has_permission: boolean }>(
      "get_last_screen_off"
    );

    // Ignore timestamps older than 18 h (not today's sleep)
    const ageMs = Date.now() - raw.timestamp;
    const fresh = raw.timestamp > 0 && ageMs >= 0 && ageMs < 18 * 60 * 60_000;

    return {
      timestamp: fresh ? raw.timestamp : null,
      hasPermission: raw.has_permission,
    };
  } catch {
    // Desktop build or command not available
    return { timestamp: null, hasPermission: false };
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

/**
 * Calculate sleep duration (as "HH:mm") from a sleep-start epoch-ms
 * timestamp to the current moment. Caps at 16 h.
 */
export function calcDurationFromTs(sleepTs: number): string {
  const diffMs = Math.max(0, Date.now() - sleepTs);
  const totalMin = Math.round(diffMs / 60_000);
  const h = Math.min(Math.floor(totalMin / 60), 16);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
