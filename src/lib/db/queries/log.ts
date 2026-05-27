import type { WeightMeasType } from "@/types";
import { getDb } from "../index";

// ─── Meal Log ─────────────────────────────────────────────────────────────────

export interface DashboardTotals {
  calories: number; protein: number; carb: number; fat: number;
  water_ml: number; exercise_kcal: number; weight_kg: number | null;
}

export async function getDashboardTotals(userId: number, date: string): Promise<DashboardTotals> {
  const db = await getDb();
  const [meals, water, exercise, runCal, weight] = await Promise.all([
    db.select<{ calories: number; protein: number; carb: number; fat: number }[]>(`
      SELECT
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.calories_kcal), 1) as calories,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.protein_g), 1) as protein,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.carbohydrates_g), 1) as carb,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.fat_g), 1) as fat
      FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
      WHERE ml.user_id = ? AND ml.log_date = ?`, [userId, date]),
    db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(amount_ml),0) as total FROM water_log WHERE user_id=? AND log_date=?", [userId, date]),
    db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(calories_burned),0) as total FROM exercise_log WHERE user_id=? AND log_date=?", [userId, date]),
    db.select<{ total: number }[]>(
      "SELECT COALESCE(SUM(calories_burned),0) as total FROM running_session WHERE user_id=? AND log_date=?", [userId, date]),
    db.select<{ weight_kg: number }[]>(
      "SELECT weight_kg FROM weight_log WHERE user_id=? AND log_date=? AND measurement_type='fasting' ORDER BY id DESC LIMIT 1", [userId, date]),
  ]);
  return {
    calories:      meals[0]?.calories      ?? 0,
    protein:       meals[0]?.protein       ?? 0,
    carb:          meals[0]?.carb          ?? 0,
    fat:           meals[0]?.fat           ?? 0,
    water_ml:      water[0]?.total         ?? 0,
    exercise_kcal: (exercise[0]?.total ?? 0) + (runCal[0]?.total ?? 0),
    weight_kg:     weight[0]?.weight_kg    ?? null,
  };
}

// ─── Weight Log ───────────────────────────────────────────────────────────────

export async function addWeightEntry(
  userId: number, weightKg: number, bodyFatPct: number | null,
  measType: WeightMeasType, date: string, notes: string | null
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO weight_log (user_id, weight_kg, body_fat_pct, measurement_type, log_date, notes)
     VALUES (?,?,?,?,?,?)`,
    [userId, weightKg, bodyFatPct, measType, date, notes]);
}

export async function deleteWeightEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM weight_log WHERE id=?", [id]);
}

// ─── Exercise Log ─────────────────────────────────────────────────────────────

export async function deleteExerciseEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM exercise_log WHERE id=?", [id]);
}

// ─── Water Log ────────────────────────────────────────────────────────────────

export async function deleteWaterEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM water_log WHERE id=?", [id]);
}
