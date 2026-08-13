import { getDb } from "../index";
import { format, subDays } from "date-fns";

export interface DashboardExtras {
  hasSleep:    boolean;
  hasStrength: boolean;
  streak:      number;
  weekly: {
    calorie:  number;  // days hit (0–7)
    balance:  number;  // days where protein/carb/fat all hit 80–110% of target
    protein:  number;
    water:    number;
    exercise: number;
  };
  weightPoints: { date: string; value: number }[]; // last 14 days, fasting weight
}

/**
 * One-shot fetch for the extra Dashboard cards: today's logged sources, current
 * streak across any logged activity, 7-day adherence per category, and the
 * 14-day fasting-weight series for the trend mini-chart.
 */
export async function getDashboardExtras(
  userId: number,
  today: string,
  targets: { calories: number; protein: number; carb: number; fat: number; water_ml: number },
): Promise<DashboardExtras> {
  const db = await getDb();

  const d7from  = format(subDays(new Date(today), 6),  "yyyy-MM-dd");
  const d14from = format(subDays(new Date(today), 13), "yyyy-MM-dd");
  const d90from = format(subDays(new Date(today), 89), "yyyy-MM-dd");

  const [
    sleepToday,
    strengthToday,
    activeDates,
    weeklyMeals,
    weeklyWater,
    weeklyExercise,
    weightRows,
  ] = await Promise.all([
    db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) as cnt FROM sleep_log WHERE user_id=? AND sleep_date=?",
      [userId, today],
    ),
    db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) as cnt FROM strength_session WHERE user_id=? AND log_date=?",
      [userId, today],
    ),
    db.select<{ log_date: string }[]>(
      `SELECT DISTINCT log_date FROM (
         SELECT log_date FROM meal_log         WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT log_date FROM water_log        WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT log_date FROM weight_log       WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT log_date FROM exercise_log     WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT log_date FROM strength_session WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT sleep_date as log_date FROM sleep_log WHERE user_id=? AND sleep_date BETWEEN ? AND ?
       ) ORDER BY log_date DESC`,
      [
        userId, d90from, today, userId, d90from, today, userId, d90from, today,
        userId, d90from, today, userId, d90from, today, userId, d90from, today,
      ],
    ),
    db.select<{ log_date: string; calories: number; protein: number; carb: number; fat: number }[]>(
      `SELECT ml.log_date,
         ROUND(SUM(ml.quantity / fd.base_quantity * fd.calories_kcal),      1) as calories,
         ROUND(SUM(ml.quantity / fd.base_quantity * fd.protein_g),          1) as protein,
         ROUND(SUM(ml.quantity / fd.base_quantity * fd.carbohydrates_g),    1) as carb,
         ROUND(SUM(ml.quantity / fd.base_quantity * fd.fat_g),              1) as fat
       FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
       WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
       GROUP BY ml.log_date`,
      [userId, d7from, today],
    ),
    db.select<{ log_date: string; water_ml: number }[]>(
      `SELECT log_date, SUM(amount_ml) as water_ml FROM water_log
       WHERE user_id=? AND log_date BETWEEN ? AND ?
       GROUP BY log_date`,
      [userId, d7from, today],
    ),
    db.select<{ log_date: string }[]>(
      `SELECT DISTINCT log_date FROM (
         SELECT log_date FROM exercise_log     WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT log_date FROM running_session  WHERE user_id=? AND log_date BETWEEN ? AND ?
         UNION
         SELECT log_date FROM strength_session WHERE user_id=? AND log_date BETWEEN ? AND ?
       )`,
      [userId, d7from, today, userId, d7from, today, userId, d7from, today],
    ),
    db.select<{ log_date: string; weight_kg: number }[]>(
      `SELECT log_date, AVG(weight_kg) as weight_kg FROM weight_log
       WHERE user_id=? AND log_date BETWEEN ? AND ? AND measurement_type='fasting'
       GROUP BY log_date ORDER BY log_date`,
      [userId, d14from, today],
    ),
  ]);

  // ── Streak: walk back from today across any logged activity ────────────────
  const dateSet = new Set(activeDates.map(r => r.log_date));
  let streak = 0;
  const cursor = new Date(today);
  while (true) {
    const d = format(cursor, "yyyy-MM-dd");
    if (!dateSet.has(d)) break;
    streak++;
    if (streak > 90) break;
    cursor.setDate(cursor.getDate() - 1);
  }

  // ── Last-7-day adherence ───────────────────────────────────────────────────
  const mealMap  = new Map(weeklyMeals.map(r => [r.log_date, r]));
  const waterMap = new Map(weeklyWater.map(r => [r.log_date, r.water_ml]));
  const exDates  = new Set(weeklyExercise.map(r => r.log_date));

  let calHit = 0, balanceHit = 0, proteinHit = 0, waterHit = 0, exHit = 0;
  const calTarget     = targets.calories || 1;
  const proteinTarget = targets.protein  || 1;
  const carbTarget    = targets.carb     || 1;
  const fatTarget     = targets.fat      || 1;
  const waterTarget   = targets.water_ml || 1;
  for (let i = 0; i < 7; i++) {
    const d = format(subDays(new Date(today), i), "yyyy-MM-dd");
    const meal = mealMap.get(d);
    if (meal) {
      const calRatio = meal.calories / calTarget;
      if (calRatio >= 0.8 && calRatio <= 1.1) calHit++;
      if (meal.protein >= targets.protein * 0.9) proteinHit++;

      const proteinRatio = meal.protein / proteinTarget;
      const carbRatio    = meal.carb    / carbTarget;
      const fatRatio     = meal.fat     / fatTarget;
      if (proteinRatio >= 0.8 && proteinRatio <= 1.1
        && carbRatio    >= 0.8 && carbRatio    <= 1.1
        && fatRatio     >= 0.8 && fatRatio     <= 1.1) balanceHit++;
    }
    const waterRatio = (waterMap.get(d) ?? 0) / waterTarget;
    if (waterRatio >= 0.8 && waterRatio <= 1.1) waterHit++;
    if (exDates.has(d)) exHit++;
  }

  return {
    hasSleep:    (sleepToday[0]?.cnt    ?? 0) > 0,
    hasStrength: (strengthToday[0]?.cnt ?? 0) > 0,
    streak,
    weekly: {
      calorie:  calHit,
      balance:  balanceHit,
      protein:  proteinHit,
      water:    waterHit,
      exercise: exHit,
    },
    weightPoints: weightRows.map(r => ({ date: r.log_date, value: r.weight_kg })),
  };
}
