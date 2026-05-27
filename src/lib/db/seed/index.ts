import type Database from "@tauri-apps/plugin-sql";
import { SEED_FOODS } from "./foods";
import { SEED_EXERCISES } from "./exercises";

/**
 * Increment when seed data changes — triggers a full re-seed on next launch.
 */
const SEED_VERSION = "11"; // added 槓鈴硬舉 (Barbell Deadlift)

/** Seeds built-in databases. On subsequent launches, returns immediately. */
export async function seedBuiltins(db: Database): Promise<void> {
  // Check stored version
  const [meta] = await db.select<{ value: string }[]>(
    "SELECT value FROM _seed_meta WHERE key='seed_version'"
  );
  const storedVersion = meta?.value ?? "";

  // Also re-seed if exercise_database got wiped (e.g. crashed mid-seed)
  const [exCount] = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) as n FROM exercise_database WHERE source_type='builtin'"
  );
  const exercisesEmpty = (exCount?.n ?? 0) === 0;

  if (storedVersion === SEED_VERSION && !exercisesEmpty) {
    return;
  }

  // ── Foods ─────────────────────────────────────────────────────────────────
  if (SEED_FOODS.length > 0) {
    // Bulk INSERT in chunks (10 params × 80 rows = 800 < 999 SQLite limit)
    const FOOD_CHUNK = 80;
    for (let i = 0; i < SEED_FOODS.length; i += FOOD_CHUNK) {
      const chunk = SEED_FOODS.slice(i, i + FOOD_CHUNK);
      const ph = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,'builtin')").join(",");
      const vals = chunk.flatMap(f => [
        f.food_name, f.name_en ?? null,
        f.protein_g, f.carbohydrates_g, f.fat_g,
        f.calories_kcal, f.base_quantity, f.base_unit, f.category,
        f.counts_as_water ? 1 : 0,
      ]);
      await db.execute(
        `INSERT OR IGNORE INTO food_database
           (food_name, name_en, protein_g, carbohydrates_g, fat_g, calories_kcal,
            base_quantity, base_unit, category, counts_as_water, source_type)
         VALUES ${ph}`,
        vals
      );
    }

    // Patch counts_as_water (single query)
    const waterNames = SEED_FOODS.filter(f => f.counts_as_water).map(f => f.food_name);
    if (waterNames.length > 0) {
      await db.execute(
        `UPDATE food_database SET counts_as_water=1
         WHERE source_type='builtin' AND food_name IN (${waterNames.map(() => "?").join(",")})`,
        waterNames
      );
    }

    // Patch misclassified categories from older seed versions
    await db.execute(
      `UPDATE food_database SET category='油脂' WHERE source_type='builtin' AND food_name='奶油（無鹽）'`
    );
    // 豆漿 should NOT sync to water (v10: remove counts_as_water flag)
    await db.execute(
      `UPDATE food_database SET category='飲料', counts_as_water=0 WHERE source_type='builtin' AND food_name='豆漿（無糖）'`
    );

    // Patch name_en — only if any rows are still missing it
    const [missingCount] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) as n FROM food_database WHERE source_type='builtin' AND (name_en IS NULL OR name_en='')"
    );
    if ((missingCount?.n ?? 0) > 0) {
      const enFoods = SEED_FOODS.filter(f => f.name_en);
      for (const f of enFoods) {
        await db.execute(
          `UPDATE food_database SET name_en=?
           WHERE source_type='builtin' AND food_name=? AND (name_en IS NULL OR name_en='')`,
          [f.name_en!, f.food_name]
        );
      }
    }
  }

  // ── Exercises: DELETE builtin then bulk INSERT ────────────────────────────
  if (SEED_EXERCISES.length > 0) {
    await db.execute("DELETE FROM exercise_database WHERE source_type='builtin'");

    const EX_CHUNK = 100; // 5 params × 100 = 500 < 999
    for (let i = 0; i < SEED_EXERCISES.length; i += EX_CHUNK) {
      const chunk = SEED_EXERCISES.slice(i, i + EX_CHUNK);
      const ph = chunk.map(() => "(?,?,?,?,?,'builtin')").join(",");
      const vals = chunk.flatMap(e => [
        e.name, e.name_en ?? null, e.category, e.default_mets, e.body_part ?? null,
      ]);
      await db.execute(
        `INSERT INTO exercise_database
           (name, name_en, category, default_mets, body_part, source_type)
         VALUES ${ph}`,
        vals
      );
    }
  }

  // ── Mark version ─────────────────────────────────────────────────────────
  await db.execute(
    "INSERT OR REPLACE INTO _seed_meta (key, value) VALUES ('seed_version', ?)",
    [SEED_VERSION]
  );
}
