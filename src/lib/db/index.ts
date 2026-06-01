import Database from "@tauri-apps/plugin-sql";
import { seedBuiltins } from "./seed";
import { cardioSessionKcal, type CardioType } from "@/lib/calculations/exercise";

let _initPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!_initPromise) {
    _initPromise = (async () => {
      const db = await Database.load("sqlite:bynalix.db");

      await initSchema(db);

      try {
        await Promise.race([
          seedBuiltins(db),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("[DB] seed timeout after 15s")), 15000)
          ),
        ]);
      } catch (e) {
        console.error("[DB] seed failed or timed out:", e);
      }

      // Backfill name_en AFTER seed so exercise_database.name_en is already populated
      try {
        await db.execute(
          `UPDATE exercise_log SET name_en = (SELECT ed.name_en FROM exercise_database ed WHERE ed.name = exercise_log.exercise_name AND ed.name_en IS NOT NULL LIMIT 1) WHERE name_en IS NULL OR name_en = ''`
        );
      } catch { /* safe to ignore */ }
      try {
        await db.execute(
          `UPDATE strength_session SET name_en = (SELECT ed.name_en FROM exercise_database ed WHERE ed.name = strength_session.exercise_name AND ed.name_en IS NOT NULL LIMIT 1) WHERE name_en IS NULL OR name_en = ''`
        );
      } catch { /* safe to ignore */ }

      // Backfill cardio calories for running_session rows that have none yet
      // (older data, or rows imported from a pre-v33 backup). Uses the real
      // distance/duration in running_interval + the correct METS-by-type model.
      try { await backfillCardioKcal(db); } catch (e) { console.error("[DB] cardio kcal backfill:", e); }

      return db;
    })();
  }
  return _initPromise;
}

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profile (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  age INTEGER,
  sex TEXT CHECK(sex IN ('male','female')),
  activity_level TEXT,
  body_fat_pct REAL,
  updated_date TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS food_database (
  food_id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_name TEXT NOT NULL UNIQUE,
  name_en TEXT,
  protein_g REAL NOT NULL,
  carbohydrates_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  calories_kcal REAL NOT NULL,
  base_quantity REAL NOT NULL DEFAULT 100,
  base_unit TEXT NOT NULL DEFAULT 'g',
  category TEXT,
  counts_as_water INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'builtin',
  created_by INTEGER,
  created_date TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meal_template (
  template_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  created_date TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES meal_template(template_id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES food_database(food_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_database (
  exercise_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  default_mets REAL NOT NULL,
  body_part TEXT,
  name_en TEXT,
  source_type TEXT NOT NULL DEFAULT 'builtin',
  created_by INTEGER,
  created_date TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mode_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  target_weight_kg REAL,
  custom_calories INTEGER,
  custom_protein_g REAL,
  custom_carb_g REAL,
  custom_fat_g REAL,
  water_goal_ml INTEGER,
  goal_type TEXT,
  goal_amount_kg REAL,
  goal_weeks INTEGER,
  goal_is_fat INTEGER DEFAULT 1,
  adv_goal_type TEXT,
  adv_goal_config TEXT,
  adv_stat_variables TEXT,
  adv2_goal_config TEXT,
  adv2_stat_variables TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  updated_date TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0,
  UNIQUE(user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS weight_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,
  measurement_type TEXT NOT NULL DEFAULT 'fasting',
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_weight_log_user_date ON weight_log(user_id, log_date);

CREATE TABLE IF NOT EXISTS meal_log (
  meal_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  meal_type TEXT,
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime')),
  FOREIGN KEY (food_id) REFERENCES food_database(food_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_log_user_date ON meal_log(user_id, log_date);

CREATE TABLE IF NOT EXISTS exercise_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  exercise_id INTEGER,
  exercise_name TEXT NOT NULL,
  name_en TEXT,
  category TEXT,
  duration_min INTEGER NOT NULL,
  intensity TEXT NOT NULL DEFAULT 'moderate',
  mets REAL,
  calories_burned REAL,
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime')),
  notes TEXT,
  FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exercise_log_user_date ON exercise_log(user_id, log_date);

CREATE TABLE IF NOT EXISTS water_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_ml INTEGER NOT NULL,
  meal_log_id INTEGER,
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime')),
  FOREIGN KEY (meal_log_id) REFERENCES meal_log(meal_log_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_water_log_user_date ON water_log(user_id, log_date);

CREATE TABLE IF NOT EXISTS strength_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  name_en TEXT,
  body_part TEXT,
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_strength_session_user_date ON strength_session(user_id, log_date);

CREATE TABLE IF NOT EXISTS strength_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  reps INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES strength_session(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS body_composition_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  body_fat_pct REAL,
  skeletal_muscle_kg REAL,
  muscle_trunk_kg REAL,
  muscle_left_arm_kg REAL,
  muscle_right_arm_kg REAL,
  muscle_left_leg_kg REAL,
  muscle_right_leg_kg REAL,
  body_water_pct REAL,
  visceral_fat_level INTEGER,
  waist_cm REAL,
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_body_comp_user_date ON body_composition_log(user_id, log_date);

CREATE TABLE IF NOT EXISTS running_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  cardio_type TEXT NOT NULL DEFAULT 'running',
  calories_burned REAL,
  log_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  log_time TEXT DEFAULT (time('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_running_session_user_date ON running_session(user_id, log_date);

CREATE TABLE IF NOT EXISTS running_interval (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  interval_num INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  duration_min REAL NOT NULL,
  FOREIGN KEY (session_id) REFERENCES running_session(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sleep_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sleep_date TEXT NOT NULL DEFAULT (DATE('now','localtime')),
  quality TEXT NOT NULL DEFAULT 'normal' CHECK(quality IN ('good','normal','poor')),
  duration_hours REAL,
  notes TEXT,
  log_time TEXT DEFAULT (time('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_sleep_log_user_date ON sleep_log(user_id, sleep_date);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _seed_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function initSchema(db: Database) {
  // ── Resilience PRAGMAs (applied before any schema work) ───────────────────
  // WAL: readers never block writers; protects against mid-write power loss
  await db.execute("PRAGMA journal_mode = WAL;");
  // NORMAL: OS flushes WAL to flash on clean shutdown — safe and fast
  await db.execute("PRAGMA synchronous = NORMAL;");
  // 5 s retry window for concurrent writes instead of immediate SQLITE_BUSY
  await db.execute("PRAGMA busy_timeout = 5000;");

  const stmts = SCHEMA.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    await db.execute(stmt + ";");
  }
  await runMigrations(db);
}

// Add columns to existing tables without dropping data
// Each entry gets a monotonically increasing version number.
// On fresh installs the SCHEMA already contains all columns, so these are no-ops
// (caught by the try-catch). On existing DBs only the pending versions run.
const MIGRATIONS: { v: number; sql: string }[] = [
  { v:  1, sql: "ALTER TABLE strength_session ADD COLUMN body_part TEXT" },
  { v:  2, sql: "ALTER TABLE body_composition_log ADD COLUMN muscle_trunk_kg REAL" },
  { v:  3, sql: "ALTER TABLE body_composition_log ADD COLUMN muscle_left_arm_kg REAL" },
  { v:  4, sql: "ALTER TABLE body_composition_log ADD COLUMN muscle_right_arm_kg REAL" },
  { v:  5, sql: "ALTER TABLE body_composition_log ADD COLUMN muscle_left_leg_kg REAL" },
  { v:  6, sql: "ALTER TABLE body_composition_log ADD COLUMN muscle_right_leg_kg REAL" },
  { v:  7, sql: "ALTER TABLE exercise_database ADD COLUMN body_part TEXT" },
  { v:  8, sql: "ALTER TABLE food_database ADD COLUMN counts_as_water INTEGER NOT NULL DEFAULT 0" },
  { v:  9, sql: "ALTER TABLE mode_settings ADD COLUMN water_goal_ml INTEGER" },
  { v: 10, sql: "ALTER TABLE mode_settings ADD COLUMN goal_type TEXT" },
  { v: 11, sql: "ALTER TABLE mode_settings ADD COLUMN goal_amount_kg REAL" },
  { v: 12, sql: "ALTER TABLE mode_settings ADD COLUMN goal_weeks INTEGER" },
  { v: 13, sql: "ALTER TABLE mode_settings ADD COLUMN goal_is_fat INTEGER DEFAULT 1" },
  { v: 14, sql: "ALTER TABLE body_composition_log ADD COLUMN waist_cm REAL" },
  { v: 15, sql: "ALTER TABLE food_database ADD COLUMN name_en TEXT" },
  { v: 16, sql: "ALTER TABLE mode_settings ADD COLUMN adv_goal_type TEXT" },
  { v: 17, sql: "ALTER TABLE mode_settings ADD COLUMN adv_goal_config TEXT" },
  { v: 18, sql: "ALTER TABLE mode_settings ADD COLUMN adv_stat_variables TEXT" },
  { v: 19, sql: "ALTER TABLE exercise_database ADD COLUMN name_en TEXT" },
  { v: 20, sql: "ALTER TABLE exercise_log ADD COLUMN name_en TEXT" },
  { v: 21, sql: "ALTER TABLE strength_session ADD COLUMN name_en TEXT" },
  { v: 22, sql: "ALTER TABLE water_log ADD COLUMN meal_log_id INTEGER" },
  { v: 23, sql: "ALTER TABLE running_session ADD COLUMN cardio_type TEXT NOT NULL DEFAULT 'running'" },
  { v: 24, sql: "UPDATE exercise_database SET category = '有氧' WHERE name LIKE '%游泳%' OR name LIKE '%swimming%' OR name LIKE '%自行車%' OR name LIKE '%cycling%' OR name LIKE '%腳踏車%'" },
  // ── v25–v30: one-time orphan cleanup for existing DBs (no FK on legacy tables) ──
  // Only removes provably-dead rows: children whose parent no longer exists.
  // Valid data and other tables are never touched. No-ops on fresh installs.
  // Order matters: clear water synced to food-orphaned meals BEFORE deleting those meals.
  { v: 25, sql: "DELETE FROM water_log WHERE meal_log_id IN (SELECT meal_log_id FROM meal_log WHERE food_id NOT IN (SELECT food_id FROM food_database))" },
  { v: 26, sql: "DELETE FROM meal_log WHERE food_id NOT IN (SELECT food_id FROM food_database)" },
  { v: 27, sql: "DELETE FROM water_log WHERE meal_log_id IS NOT NULL AND meal_log_id NOT IN (SELECT meal_log_id FROM meal_log)" },
  { v: 28, sql: "DELETE FROM strength_set WHERE session_id NOT IN (SELECT id FROM strength_session)" },
  { v: 29, sql: "DELETE FROM running_interval WHERE session_id NOT IN (SELECT id FROM running_session)" },
  { v: 30, sql: "DELETE FROM meal_template_items WHERE template_id NOT IN (SELECT template_id FROM meal_template) OR food_id NOT IN (SELECT food_id FROM food_database)" },
  { v: 31, sql: "ALTER TABLE mode_settings ADD COLUMN adv2_goal_config TEXT" },
  { v: 32, sql: "ALTER TABLE mode_settings ADD COLUMN adv2_stat_variables TEXT" },
  { v: 33, sql: "ALTER TABLE running_session ADD COLUMN calories_burned REAL" },
  { v: 34, sql: "ALTER TABLE mode_settings ADD COLUMN fat_kcal_ratio REAL DEFAULT 0.30" },
];

// Compute & store calories for running_session rows missing them, using the
// real interval distances/durations and the METS-by-type cardio model.
async function backfillCardioKcal(db: Database) {
  const [p] = await db.select<{ weight_kg: number }[]>(
    "SELECT weight_kg FROM user_profile ORDER BY user_id LIMIT 1"
  );
  const wt = p?.weight_kg ?? 0;
  if (!wt) return;
  const sessions = await db.select<{ id: number; cardio_type: string }[]>(
    "SELECT id, COALESCE(cardio_type,'running') as cardio_type FROM running_session WHERE calories_burned IS NULL"
  );
  for (const s of sessions) {
    const ivs = await db.select<{ distance_km: number; duration_min: number }[]>(
      "SELECT distance_km, duration_min FROM running_interval WHERE session_id=?", [s.id]
    );
    const kcal = cardioSessionKcal(s.cardio_type as CardioType, ivs, wt);
    await db.execute("UPDATE running_session SET calories_burned=? WHERE id=?", [kcal, s.id]);
  }
}

async function runMigrations(db: Database) {
  // Ensure marker + version exist before reading schema_version
  await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('db_marker', '9527')");
  await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('app_version', '1.0.0')");

  const [vRow] = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key='schema_version'"
  );
  const current = vRow ? parseInt(vRow.value) : 0;

  const pending = MIGRATIONS.filter(m => m.v > current);
  if (pending.length === 0) return;

  let reached = current;
  for (const m of pending) {
    try { await db.execute(m.sql); } catch { /* column already exists on existing DB */ }
    reached = m.v;
  }

  await db.execute(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)",
    [String(reached)]
  );
}
