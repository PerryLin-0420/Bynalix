import { getDb } from "../index";
import { getWalkDays, type WalkStatus } from "@/lib/healthConnect";

/**
 * Mirror Health Connect's per-day walking minutes into walk_log.
 *
 * The source is already aggregated per calendar day and is the authority, so
 * each day it reports is replaced outright rather than added to — re-syncing
 * is therefore idempotent, and a day later corrected upstream (a session
 * edited or deleted in the health app) corrects here too.
 *
 * Returns the status so the UI can distinguish "no Health Connect on this
 * device" from "installed but not yet granted".
 */
export async function syncWalkDays(userId: number): Promise<WalkStatus> {
  const { status, days } = await getWalkDays();
  if (status !== "ok" || days.length === 0) return status;

  const db = await getDb();
  for (const d of days) {
    await db.execute(
      `INSERT INTO walk_log (user_id, log_date, walk_min, updated_at)
       VALUES (?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(user_id, log_date) DO UPDATE SET
         walk_min = excluded.walk_min,
         updated_at = datetime('now','localtime')`,
      [userId, d.date, Math.round(d.min * 10) / 10],
    );
  }
  return status;
}

/** Walking minutes for one day, or null when nothing is recorded. */
export async function getWalkDay(userId: number, date: string): Promise<number | null> {
  const db = await getDb();
  const [row] = await db.select<{ walk_min: number }[]>(
    "SELECT walk_min FROM walk_log WHERE user_id=? AND log_date=?", [userId, date],
  );
  return row?.walk_min ?? null;
}
