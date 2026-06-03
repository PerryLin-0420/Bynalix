import { invoke } from "@tauri-apps/api/core";

/**
 * Returns the epoch-millisecond timestamp of the last time the Android
 * screen turned off (= last phone use before sleep), or null when:
 *   - running on desktop / web
 *   - the receiver hasn't fired yet (first launch)
 *   - the timestamp is too old to be a sleep candidate (> 18 h)
 */
export async function getLastScreenOff(): Promise<number | null> {
  try {
    const ts = await invoke<number>("get_last_screen_off");
    if (ts <= 0) return null;

    // Ignore if the last screen-off was more than 18 hours ago —
    // it's probably not the sleep we're trying to log.
    const ageMs = Date.now() - ts;
    if (ageMs < 0 || ageMs > 18 * 60 * 60 * 1000) return null;

    return ts;
  } catch {
    return null;
  }
}

/** Convert an epoch-ms timestamp to a "HH:mm" string in local time. */
export function tsToHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Calculate sleep duration (as "HH:mm") from a sleep-start epoch-ms
 * timestamp to the current moment.
 * Caps at 16 h to avoid absurd values from stale timestamps.
 */
export function calcDurationFromTs(sleepTs: number): string {
  const diffMs = Math.max(0, Date.now() - sleepTs);
  const totalMin = Math.round(diffMs / 60_000);
  const h = Math.min(Math.floor(totalMin / 60), 16);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
