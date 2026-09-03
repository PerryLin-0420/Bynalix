import type { DailyStatsRecord, WeightChartPoint, CalorieChartPoint } from "@/types";
import { getDb } from "../index";
import { subDays, format } from "date-fns";

export type ActivitySource = "meal" | "exercise" | "weight" | "body";

const ACTIVITY_TABLE: Record<ActivitySource, string> = {
  meal:     "meal_log",
  exercise: "exercise_log",
  weight:   "weight_log",
  body:     "body_composition_log",
};

/** Distinct dates that have any logged data across the given sources */
export async function getActiveDates(userId: number, sources: ActivitySource[]): Promise<Set<string>> {
  const db = await getDb();
  const sql = sources
    .map(s => `SELECT DISTINCT log_date FROM ${ACTIVITY_TABLE[s]} WHERE user_id = ?`)
    .join(" UNION ");
  const rows = await db.select<{ log_date: string }[]>(sql, sources.map(() => userId));
  return new Set(rows.map(r => r.log_date));
}

/**
 * First and last dates carrying any logged data at all, across every log table.
 *
 * Broader than `getActiveDates`, which only covers the four sources the
 * calendars mark: a shrinking-window scan needs the true edges of the record
 * so its default start is the earliest day analysis can reach, not the
 * earliest day with a meal on it. Each table contributes its own MIN/MAX so
 * the scan stays on the indexed column instead of unioning every row.
 */
export async function getDataDateBounds(userId: number): Promise<{ first: string; last: string } | null> {
  const db = await getDb();
  const tables: [string, string][] = [
    ["meal_log", "log_date"],
    ["water_log", "log_date"],
    ["exercise_log", "log_date"],
    ["strength_session", "log_date"],
    ["running_session", "log_date"],
    ["weight_log", "log_date"],
    ["body_composition_log", "log_date"],
    ["sleep_log", "sleep_date"],
  ];
  const sql = `SELECT MIN(lo) as first, MAX(hi) as last FROM (${
    tables
      .map(([t, c]) => `SELECT MIN(${c}) as lo, MAX(${c}) as hi FROM ${t} WHERE user_id = ?`)
      .join(" UNION ALL ")
  })`;
  const [row] = await db.select<{ first: string | null; last: string | null }[]>(
    sql, tables.map(() => userId));
  if (!row?.first || !row?.last) return null;
  return { first: row.first, last: row.last };
}

/** Builds date range array YYYY-MM-DD from today back N days */
function dateRange(days: number): string[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) =>
    format(subDays(today, days - 1 - i), "yyyy-MM-dd")
  );
}

/** Full stats per day for Pearson calculation */
export async function getDailyStatsRecords(
  userId: number,
  days = 90,
  fromDate?: string,
  toDate?: string,
): Promise<DailyStatsRecord[]> {
  const db = await getDb();
  let dates: string[];
  let from: string;
  let to: string;
  if (fromDate && toDate) {
    dates = [];
    for (const d = new Date(fromDate); format(d, "yyyy-MM-dd") <= toDate; d.setDate(d.getDate() + 1)) {
      dates.push(format(d, "yyyy-MM-dd"));
    }
    from = fromDate;
    to   = toDate;
  } else {
    dates = dateRange(days);
    from  = dates[0];
    to    = dates[dates.length - 1];
  }

  const [profRow] = await db.select<{ weight_kg: number }[]>(
    "SELECT weight_kg FROM user_profile WHERE user_id=? ORDER BY user_id LIMIT 1", [userId]);
  const bodyWt = profRow?.weight_kg ?? 70;

  const [weights, meals, water, exercise, strength, sleep, lastMeal, mealTimes, exTime] = await Promise.all([
    db.select<{ log_date: string; weight_kg: number }[]>(`
      SELECT log_date, AVG(weight_kg) as weight_kg FROM weight_log
      WHERE user_id=? AND log_date BETWEEN ? AND ? AND measurement_type='fasting'
      GROUP BY log_date`, [userId, from, to]),
    db.select<{ log_date: string; calories: number; protein_g: number; carb_g: number; fat_g: number }[]>(`
      SELECT ml.log_date,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.calories_kcal), 1) as calories,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.protein_g), 1) as protein_g,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.carbohydrates_g), 1) as carb_g,
        ROUND(SUM(ml.quantity / fd.base_quantity * fd.fat_g), 1) as fat_g
      FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
      WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
      GROUP BY ml.log_date`, [userId, from, to]),
    db.select<{ log_date: string; water_ml: number }[]>(`
      SELECT log_date, SUM(amount_ml) as water_ml FROM water_log
      WHERE user_id=? AND log_date BETWEEN ? AND ?
      GROUP BY log_date`, [userId, from, to]),
    db.select<{
      log_date: string; exercise_count: number; exercise_min: number;
      exercise_kcal: number; cardio_count: number; strength_count: number;
    }[]>(`
      SELECT log_date,
        SUM(cnt) as exercise_count,
        SUM(mins) as exercise_min,
        ROUND(SUM(kcal), 1) as exercise_kcal,
        SUM(cardio_cnt) as cardio_count,
        SUM(strength_cnt) as strength_count
      FROM (
        -- generic exercise/cardio logged in exercise_log
        SELECT log_date, COUNT(*) as cnt,
          COALESCE(SUM(duration_min), 0) as mins,
          COALESCE(SUM(calories_burned), 0) as kcal,
          COUNT(*) as cardio_cnt, 0 as strength_cnt
        FROM exercise_log WHERE user_id=? AND log_date BETWEEN ? AND ?
        GROUP BY log_date
        UNION ALL
        -- structured cardio sessions: count + pre-computed calories (no interval join)
        SELECT log_date, COUNT(*) as cnt, 0 as mins,
          COALESCE(SUM(calories_burned), 0) as kcal,
          COUNT(*) as cardio_cnt, 0 as strength_cnt
        FROM running_session WHERE user_id=? AND log_date BETWEEN ? AND ?
        GROUP BY log_date
        UNION ALL
        -- structured cardio duration from intervals
        SELECT rs.log_date, 0 as cnt,
          COALESCE(SUM(ri.duration_min), 0) as mins, 0 as kcal,
          0 as cardio_cnt, 0 as strength_cnt
        FROM running_session rs
        JOIN running_interval ri ON ri.session_id = rs.id
        WHERE rs.user_id=? AND rs.log_date BETWEEN ? AND ?
        GROUP BY rs.log_date
        UNION ALL
        -- strength training: per-set MET based on lift/body ratio + rest phase
        SELECT ss.log_date, 0 as cnt, 0 as mins,
          ROUND(SUM(
            (CASE WHEN st.weight_kg / ? < 0.5 THEN 3.5 WHEN st.weight_kg / ? <= 1.0 THEN 5.0 ELSE 6.5 END)
            * ? * (st.reps * 3.0 / 3600.0)
            + COALESCE(st.rest_sec, 0) * 2.0 * ? / 3600.0
          ), 1) as kcal,
          0 as cardio_cnt, COUNT(DISTINCT ss.id) as strength_cnt
        FROM strength_session ss
        JOIN strength_set st ON st.session_id = ss.id
        WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?
        GROUP BY ss.log_date
      )
      GROUP BY log_date`, [userId, from, to, userId, from, to, userId, from, to, bodyWt, bodyWt, bodyWt, bodyWt, userId, from, to]),
    db.select<{ log_date: string; strength_volume_kg: number }[]>(`
      SELECT ss.log_date,
        ROUND(SUM(st.weight_kg * st.reps), 1) as strength_volume_kg
      FROM strength_session ss
      JOIN strength_set st ON st.session_id = ss.id
      WHERE ss.user_id=? AND ss.log_date BETWEEN ? AND ?
      GROUP BY ss.log_date`, [userId, from, to]),
    db.select<{ log_date: string; sleep_quality: number; sleep_hours: number | null; wake_up_time: string | null }[]>(`
      SELECT sleep_date as log_date,
        CASE quality WHEN 'good' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END as sleep_quality,
        duration_hours as sleep_hours,
        wake_up_time
      FROM sleep_log WHERE user_id=? AND sleep_date BETWEEN ? AND ?`, [userId, from, to]),
    db.select<{ log_date: string; last_meal_time: string }[]>(`
      SELECT log_date, MAX(log_time) as last_meal_time FROM meal_log
      WHERE user_id=? AND log_date BETWEEN ? AND ?
      GROUP BY log_date`, [userId, from, to]),
    // One row per meal, not per food item: a meal's items are saved together
    // (measured p90 spread within a group: 0 minutes), so the group's earliest
    // entry is when that meal happened.
    db.select<{ log_date: string; meal_type: string | null; meal_time: string }[]>(`
      SELECT log_date, meal_type, MIN(log_time) as meal_time FROM meal_log
      WHERE user_id=? AND log_date BETWEEN ? AND ? AND log_time IS NOT NULL
      GROUP BY log_date, meal_type`, [userId, from, to]),
    db.select<{ log_date: string; ex_time: string }[]>(`
      SELECT log_date, MAX(t) as ex_time FROM (
        SELECT log_date, log_time as t FROM exercise_log     WHERE user_id=? AND log_date BETWEEN ? AND ?
        UNION ALL
        SELECT log_date, log_time as t FROM strength_session WHERE user_id=? AND log_date BETWEEN ? AND ?
        UNION ALL
        SELECT log_date, log_time as t FROM running_session  WHERE user_id=? AND log_date BETWEEN ? AND ?
      ) WHERE t IS NOT NULL
      GROUP BY log_date`, [userId, from, to, userId, from, to, userId, from, to]),
  ]);

  const wMap   = new Map(weights.map(r  => [r.log_date, r.weight_kg]));
  const mMap   = new Map(meals.map(r    => [r.log_date, r]));
  const wlMap  = new Map(water.map(r    => [r.log_date, r.water_ml]));
  const eMap   = new Map(exercise.map(r => [r.log_date, r]));
  const sMap   = new Map(strength.map(r => [r.log_date, r.strength_volume_kg]));
  const slMap  = new Map(sleep.map(r    => [r.log_date, r]));
  const lmMap  = new Map(lastMeal.map(r => [r.log_date, r.last_meal_time]));
  const etMap  = new Map(exTime.map(r   => [r.log_date, r.ex_time]));

  /** "HH:MM[:SS]" -> decimal hours; unwrap=true maps post-midnight (< 4 AM) to h+24. */
  const toHour = (t: string | null | undefined, unwrap = false): number | null => {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    if (!m) return null;
    let h = parseInt(m[1]) + parseInt(m[2]) / 60;
    if (unwrap && h < 4) h += 24;
    return Math.round(h * 100) / 100;
  };

  /**
   * Meal spacing per day, in decimal hours.
   *
   * Times are unwrapped before sorting (a 01:37 late-night snack belongs after
   * that evening's dinner, not before its breakfast — real logs do contain
   * these), so both figures are computed on a correctly ordered day.
   *
   * A day with a single logged meal reports 0 for both. For the eating window
   * that is simply true — one meal is a zero-length window, the most
   * time-restricted a day can be. For the longest gap it is a deliberate
   * convention rather than a measurement: there is no between-meal gap to
   * measure, and 0 sits at the opposite end of the scale from the all-day fast
   * such a day actually represents. Measured on a real 85-day export (6 of 69
   * logged days had one meal): it moves eating-window-vs-calories from r=+0.51
   * to +0.45 and flips the sign of both variables' weak weight correlation,
   * but nothing it touches comes near the network's |r| ≥ 0.3 edge bar, so no
   * edge is created or destroyed by it. Worth revisiting for a user who eats
   * one meal a day often enough for those days to stop being a minority.
   *
   * Days with no meal at all stay null — no meals is missing data, not zero.
   */
  const mealSpacing = new Map<string, { window: number; maxGap: number }>();
  {
    const perDay = new Map<string, number[]>();
    for (const r of mealTimes) {
      const h = toHour(r.meal_time, true);
      if (h == null) continue;
      const list = perDay.get(r.log_date);
      if (list) list.push(h); else perDay.set(r.log_date, [h]);
    }
    for (const [date, hours] of perDay) {
      hours.sort((a, b) => a - b);
      if (hours.length < 2) { mealSpacing.set(date, { window: 0, maxGap: 0 }); continue; }
      let maxGap = 0;
      for (let i = 1; i < hours.length; i++) maxGap = Math.max(maxGap, hours[i] - hours[i - 1]);
      mealSpacing.set(date, {
        window: Math.round((hours[hours.length - 1] - hours[0]) * 100) / 100,
        maxGap: Math.round(maxGap * 100) / 100,
      });
    }
  }

  return dates.map(date => ({
    date,
    weight_kg:          wMap.get(date)  ?? null,
    calories:           mMap.get(date)?.calories  ?? null,
    protein_g:          mMap.get(date)?.protein_g ?? null,
    carb_g:             mMap.get(date)?.carb_g    ?? null,
    fat_g:              mMap.get(date)?.fat_g     ?? null,
    water_ml:           wlMap.get(date) ?? null,
    exercise_count:     eMap.get(date)?.exercise_count ?? null,
    exercise_min:       eMap.get(date)?.exercise_min   ?? null,
    exercise_kcal:      eMap.get(date)?.exercise_kcal  ?? null,
    cardio_count:       eMap.get(date)?.cardio_count   ?? null,
    strength_count:     eMap.get(date)?.strength_count ?? null,
    strength_volume_kg: sMap.get(date) ?? null,
    sleep_quality:      slMap.get(date)?.sleep_quality ?? null,
    sleep_hours:        slMap.get(date)?.sleep_hours   ?? null,
    last_meal_hour:     toHour(lmMap.get(date), true),
    exercise_hour:      toHour(etMap.get(date)),
    wake_hour:          toHour(slMap.get(date)?.wake_up_time),
    eating_window_h:    mealSpacing.get(date)?.window ?? null,
    max_meal_gap_h:     mealSpacing.get(date)?.maxGap ?? null,
  }));
}

export async function getWeightHistory(userId: number, days = 30): Promise<WeightChartPoint[]> {
  const db = await getDb();
  const dates = dateRange(days);
  const rows = await db.select<{ log_date: string; weight_kg: number; body_fat_pct: number | null }[]>(`
    SELECT log_date, AVG(weight_kg) as weight_kg, AVG(body_fat_pct) as body_fat_pct
    FROM weight_log WHERE user_id=? AND log_date BETWEEN ? AND ? AND measurement_type='fasting'
    GROUP BY log_date ORDER BY log_date`, [userId, dates[0], dates[dates.length - 1]]);
  const map = new Map(rows.map(r => [r.log_date, r]));
  return dates.map(date => ({
    date,
    weight:   map.get(date)?.weight_kg    ?? null,
    body_fat: map.get(date)?.body_fat_pct ?? null,
  }));
}

export async function getCalorieHistory(userId: number, days = 30, targetKcal: number): Promise<CalorieChartPoint[]> {
  const db = await getDb();
  const dates = dateRange(days);
  const rows = await db.select<{ log_date: string; calories: number; protein: number; carb: number; fat: number }[]>(`
    SELECT ml.log_date,
      ROUND(SUM(ml.quantity / fd.base_quantity * fd.calories_kcal), 0) as calories,
      ROUND(SUM(ml.quantity / fd.base_quantity * fd.protein_g), 0) as protein,
      ROUND(SUM(ml.quantity / fd.base_quantity * fd.carbohydrates_g), 0) as carb,
      ROUND(SUM(ml.quantity / fd.base_quantity * fd.fat_g), 0) as fat
    FROM meal_log ml JOIN food_database fd ON ml.food_id = fd.food_id
    WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
    GROUP BY ml.log_date`, [userId, dates[0], dates[dates.length - 1]]);
  const map = new Map(rows.map(r => [r.log_date, r]));
  return dates.map(date => ({
    date,
    calories: map.get(date)?.calories ?? 0,
    target:   targetKcal,
    protein:  map.get(date)?.protein  ?? 0,
    carb:     map.get(date)?.carb     ?? 0,
    fat:      map.get(date)?.fat      ?? 0,
  }));
}

export async function getMealCountHistory(userId: number, days = 30): Promise<{ date: string; meals: number }[]> {
  const db = await getDb();
  const dates = dateRange(days);
  // Count distinct meal_type per day, but only those with total kcal >= 20
  // (filters out zero-calorie entries like tea, water logs, etc.)
  const rows = await db.select<{ log_date: string; meals: number }[]>(`
    SELECT log_date, COUNT(*) as meals
    FROM (
      SELECT ml.log_date, ml.meal_type
      FROM meal_log ml
      JOIN food_database fd ON fd.food_id = ml.food_id
      WHERE ml.user_id=? AND ml.log_date BETWEEN ? AND ?
      GROUP BY ml.log_date, ml.meal_type
      HAVING SUM(fd.calories_kcal * ml.quantity / fd.base_quantity) >= 20
    )
    GROUP BY log_date`, [userId, dates[0], dates[dates.length - 1]]);
  const map = new Map(rows.map(r => [r.log_date, r.meals]));
  return dates.map(date => ({ date, meals: map.get(date) ?? 0 }));
}
