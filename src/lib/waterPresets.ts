/**
 * Water quick-add shortcuts. Each user can change the amounts and their order;
 * the number of shortcuts stays DEFAULT_WATER_PRESETS.length.
 * Stored per user in app_settings as a JSON array of ml.
 */
import { getDb } from "@/lib/db";

export const DEFAULT_WATER_PRESETS = [150, 250, 350, 500];
export const WATER_PRESET_MAX = 5000;

const key = (userId: number) => `water_presets_${userId}`;

/** A stored list, or the defaults when it is missing or not the right shape. */
export function parseWaterPresets(json: string | null | undefined): number[] {
  if (!json) return DEFAULT_WATER_PRESETS;
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v) && v.length === DEFAULT_WATER_PRESETS.length
        && v.every(n => Number.isInteger(n) && n > 0 && n <= WATER_PRESET_MAX)) return v;
  } catch { /* fall through */ }
  return DEFAULT_WATER_PRESETS;
}

export async function loadWaterPresets(userId: number): Promise<number[]> {
  const db = await getDb();
  const [row] = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key=?", [key(userId)]);
  return parseWaterPresets(row?.value);
}

export async function saveWaterPresets(userId: number, presets: number[]): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key(userId), JSON.stringify(presets)]);
}
