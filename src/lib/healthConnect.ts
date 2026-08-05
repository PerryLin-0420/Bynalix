import { invoke } from "@tauri-apps/api/core";

/**
 * Walking time sourced from Health Connect.
 *
 * No Android sensor reports walking *duration* — the per-day walking time a
 * phone shows comes from a health app (Samsung Health, Google Fit, ...) that
 * publishes into Health Connect, the on-device health store. Reading from
 * there means the data arrives already aggregated per calendar day, so there
 * is nothing to reconstruct on this side.
 */

export type WalkStatus = "unavailable" | "no_permission" | "ok";

export interface WalkDay {
  date: string;   // YYYY-MM-DD
  min: number;    // walking minutes that day
}

export interface WalkDaysResult {
  status: WalkStatus;
  days: WalkDay[];
}

export async function getWalkDays(): Promise<WalkDaysResult> {
  try {
    const raw = await invoke<{ status: string; days_json: string }>("get_walk_days");
    const status: WalkStatus =
      raw.status === "ok" || raw.status === "no_permission" ? raw.status : "unavailable";

    let days: WalkDay[] = [];
    try {
      const parsed = JSON.parse(raw.days_json);
      if (Array.isArray(parsed)) {
        days = parsed.filter(
          (d): d is WalkDay =>
            d && typeof d.date === "string" && typeof d.min === "number" && d.min >= 0,
        );
      }
    } catch { /* malformed payload — treat as empty */ }

    return { status, days };
  } catch {
    // Desktop build or command unavailable
    return { status: "unavailable", days: [] };
  }
}

/** Open Health Connect so the user can grant read access (or install it). */
export function openHealthConnect(): void {
  (window as any).AndroidBridge?.openHealthConnect();
}

/** Force a re-read of Health Connect (e.g. after returning from its settings). */
export function refreshWalkStats(): void {
  (window as any).AndroidBridge?.refreshWalkStats();
}
