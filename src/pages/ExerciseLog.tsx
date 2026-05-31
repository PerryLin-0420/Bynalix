import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { format } from "date-fns";
import { Dumbbell, Droplets, Plus, Trash2, X, Star, Pencil, Check, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { showToast } from "@/store/toastStore";
import { deleteExerciseEntry, deleteWaterEntry } from "@/lib/db/queries/log";
import { checkBound, BOUNDS } from "@/lib/validate";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { NoProfile } from "@/components/common/NoProfile";
import { DateNavHeader } from "@/components/layout/DateNavHeader";
import { exerciseKcalBasic, exerciseKcalLbm, cardioSessionKcal, strengthEstKcal, type Intensity, type CardioType as CardioKind } from "@/lib/calculations/exercise";
import { BODY_PART_COLORS, BODY_PARTS, CARDIO_EMOJI, CARDIO_LABEL, type BodyPart } from "@/constants";
import { leanBodyMass } from "@/lib/calculations/metabolism";
import { ExerciseHistoryDrawer } from "@/components/exercise/ExerciseHistoryDrawer";
import { TimePicker } from "@/components/TimePicker";
import { useSwipeTabs } from "@/hooks/useSwipe";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "cardio" | "running" | "strength" | "other" | "water";

interface ExerciseDB {
  exercise_id: number; name: string; name_en: string | null; category: string;
  default_mets: number; source_type: string; body_part: string | null;
}
interface ExerciseEntry {
  id: number; exercise_name: string; name_en: string | null; category: string | null;
  duration_min: number; intensity: Intensity; calories_burned: number;
}
interface WaterEntry   { id: number; amount_ml: number; log_time: string; meal_log_id: number | null }
interface StrengthSet  { id: number; set_number: number; weight_kg: number; reps: number }
interface StrengthSession {
  id: number; exercise_name: string; name_en: string | null;
  body_part: string | null; log_time: string; sets: StrengthSet[];
}
interface SetInput { weight: string; reps: string }
interface RunInterval { distance: string; time: string }
type CardioType = "running" | "swimming" | "cycling";
type CardioFilter = "all" | CardioType;
interface RunningInterval { id: number; session_id: number; interval_num: number; distance_km: number; duration_min: number }
interface RunningSession  { id: number; log_time: string; cardio_type: string; intervals: RunningInterval[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const WATER_PRESETS = [150, 250, 350, 500];


// Body-part i18n key map (values stay Chinese in DB/state)
const BODY_PART_I18N: Record<string, string> = {
  胸: "exercise.bodyParts.chest",
  背: "exercise.bodyParts.back",
  腿: "exercise.bodyParts.legs",
  腹: "exercise.bodyParts.abs",
  手: "exercise.bodyParts.arms",
  肩: "exercise.bodyParts.shoulder",
};

const CARDIO_FILTERS: { key: CardioFilter; label: string; emoji: string }[] = [
  { key: "all",      label: "全部",  emoji: "" },
  { key: "running",  label: "跑步",  emoji: "🏃" },
  { key: "swimming", label: "游泳",  emoji: "🏊" },
  { key: "cycling",  label: "自行車", emoji: "🚴" },
];

// ─── Shared sub-components ────────────────────────────────────────────────────

type EditingEx = { id: number; duration: string; intensity: Intensity } | null;

function ExerciseEntryCard({ e, editingEx, setEditingEx, saveEditEx, onDelete, kcalColor, intensityLabels, t, exName, catLabel }: {
  e: ExerciseEntry;
  editingEx: EditingEx;
  setEditingEx: Dispatch<SetStateAction<EditingEx>>;
  saveEditEx: () => void;
  onDelete: () => void;
  kcalColor: string;
  intensityLabels: Record<string, string>;
  t: (key: any) => string;
  exName: (item: { exercise_name: string; name_en?: string | null }) => string;
  catLabel: (cat: string | null | undefined) => string;
}) {
  return (
    <div className="card">
      {editingEx?.id === e.id ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-on-surface)] mb-2">{exName(e)}</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input className="input-base py-1.5 pr-10 text-sm" type="number" inputMode="decimal"
                  value={editingEx.duration}
                  onChange={ev => setEditingEx(x => x ? { ...x, duration: ev.target.value } : null)} />
                <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">{t("exercise.min")}</span>
              </div>
              <select className="input-base py-1.5 text-sm flex-1"
                value={editingEx.intensity}
                onChange={ev => setEditingEx(x => x ? { ...x, intensity: ev.target.value as Intensity } : null)}>
                {Object.entries(intensityLabels).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={saveEditEx} className="p-1.5 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
              <Check size={15} />
            </button>
            <button onClick={() => setEditingEx(null)} className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--text-on-surface)]">{exName(e)}</p>
            <p className="text-xs text-[var(--text-on-surface-muted)]">
              {e.duration_min} {t("exercise.min")} · {intensityLabels[e.intensity]} · {catLabel(e.category)}
            </p>
          </div>
          <p className={`text-sm font-bold ${kcalColor}`}>{Math.round(e.calories_burned)} kcal</p>
          <button onClick={() => setEditingEx({ id: e.id, duration: String(e.duration_min), intensity: e.intensity })}
            className="p-1.5 text-yellow-400 hover:text-yellow-500 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExerciseLog() {
  const { profile, modeSettings } = useUserStore();
  const { t, lang } = useLangStore();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  /** Translates Chinese category stored in DB to display label */
  const catLabel = (cat: string | null | undefined): string => {
    if (!cat) return "";
    const map: Record<string, string> = lang === "zh"
      ? { "有氧": "有氧", "重訓": "重訓", "球類": "球類", "伸展": "伸展", "水上運動": "水上運動", "其他": "其他", "自訂": "自訂" }
      : { "有氧": "Cardio", "重訓": "Strength", "球類": "Ball Sports", "伸展": "Stretching", "水上運動": "Aquatics", "其他": "Other", "自訂": "Custom" };
    return map[cat] ?? cat;
  };

  /** Returns the localized display label for a Chinese body-part key */
  const bpLabel = (part: string | null | undefined): string => {
    if (!part) return "";
    const key = BODY_PART_I18N[part];
    return key ? t(key as any) : part;
  };

  /** Returns bilingual exercise name: English when lang=en and name_en exists */
  const exName = (item: { exercise_name: string; name_en?: string | null }): string =>
    (lang === "en" && item.name_en) ? item.name_en : item.exercise_name;

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [historyOpen, setHistoryOpen]   = useState(false);

  const [tab, setTab] = useState<Tab>("cardio");
  const EX_TABS = ["cardio", "running", "strength", "other", "water"] as const;
  const exSwipe = useSwipeTabs(EX_TABS, tab, setTab as (t: string) => void);

  // Cardio exercise
  const [exercises, setExercises]     = useState<ExerciseDB[]>([]);
  const [exEntries, setExEntries]     = useState<ExerciseEntry[]>([]);
  const [favExs, setFavExs]           = useState<ExerciseDB[]>([]);
  const [showExForm, setShowExForm]   = useState(false);
  const [exSearch, setExSearch]       = useState("");
  const [selEx, setSelEx]             = useState<ExerciseDB | null>(null);
  const [exDuration, setExDuration]   = useState("30");
  const [exIntensity, setExIntensity] = useState<Intensity>("moderate");
  const [totalExKcal, setTotalExKcal] = useState(0);

  // Strength
  const [sessions, setSessions]         = useState<StrengthSession[]>([]);
  const [showStrength, setShowStrength] = useState(false);
  const [strSearch, setStrSearch]       = useState("");
  const [strExName, setStrExName]       = useState("");
  const [strBodyPart, setStrBodyPart]   = useState<BodyPart | "">("");
  const [strSets, setStrSets]           = useState<SetInput[]>([{ weight: "", reps: "" }]);
  const [addSetTo, setAddSetTo]         = useState<{ sessionId: number; w: string; r: string } | null>(null);
  const [strFilterPart, setStrFilterPart] = useState<BodyPart | "全部">("全部");
  const [strNameFocused, setStrNameFocused] = useState(false);
  const [strBodyPartError, setStrBodyPartError] = useState(false);

  // Running
  const [runningSessions, setRunningSessions]     = useState<RunningSession[]>([]);
  const [showRunForm, setShowRunForm]             = useState(false);
  const [runIntervals, setRunIntervals]           = useState<RunInterval[]>([{ distance: "", time: "" }]);
  const [addRunIntervalTo, setAddRunIntervalTo]   = useState<{ sessionId: number; d: string; t: string } | null>(null);
  const [editingRunInterval, setEditingRunInterval] = useState<{ id: number; distance: string; time: string } | null>(null);
  const [cardioFilter, setCardioFilter]   = useState<CardioFilter>("all");
  const [addCardioType, setAddCardioType] = useState<CardioType | "">("");

  // Water
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [totalWater, setTotalWater]     = useState(0);
  const [waterAmount, setWaterAmount]   = useState("250");
  const [waterTime, setWaterTime]       = useState(format(new Date(), "HH:mm"));

  // Custom cardio exercise
  const [customExKcal, setCustomExKcal]         = useState("");
  const [customExDuration, setCustomExDuration] = useState("30");
  const [customExNameEn, setCustomExNameEn]     = useState("");

  // Custom strength exercise (new move)
  const [strExNameEn, setStrExNameEn] = useState("");

  // Other tab mode
  const [exFormMode, setExFormMode] = useState<"cardio" | "other">("cardio");

  // Form validation errors
  const [cardioErr,   setCardioErr]   = useState<string | null>(null);
  const [waterAddErr, setWaterAddErr] = useState<string | null>(null);
  const [strFormErr,  setStrFormErr]  = useState<string | null>(null);
  const [runFormErr,  setRunFormErr]  = useState<string | null>(null);
  const [addSetErr,   setAddSetErr]   = useState<string | null>(null);

  // Inline edit states
  const [editingEx,      setEditingEx]      = useState<{ id: number; duration: string; intensity: Intensity } | null>(null);
  const [editingSession, setEditingSession] = useState<{ id: number; name: string; bodyPart: string } | null>(null);
  const [editingSet,     setEditingSet]     = useState<{ id: number; weight: string; reps: string } | null>(null);
  const [editingWater,   setEditingWater]   = useState<{ id: number; amount: string; time: string } | null>(null);

  useEffect(() => {
    if (profile) { loadAll(); loadExerciseDb(); loadSessions(); loadRunningSessions(); }
    setWaterTime(format(new Date(), "HH:mm"));
  }, [profile, selectedDate]);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadAll = async () => {
    try {
      const db  = await getDb();
      const uid = profile!.user_id;
      const [ex, water, favEx] = await Promise.all([
        db.select<ExerciseEntry[]>(
          "SELECT * FROM exercise_log WHERE user_id=? AND log_date=? ORDER BY log_time DESC", [uid, selectedDate]),
        db.select<WaterEntry[]>(
          "SELECT * FROM water_log WHERE user_id=? AND log_date=? ORDER BY log_time DESC", [uid, selectedDate]),
        db.select<ExerciseDB[]>(`
          SELECT ed.* FROM user_favorites uf
          JOIN exercise_database ed ON uf.item_id = ed.exercise_id
          WHERE uf.user_id=? AND uf.item_type='exercise'`, [uid]),
      ]);
      setExEntries(ex);
      setTotalExKcal(ex.reduce((s, e) => s + (e.calories_burned ?? 0), 0));
      setWaterEntries(water);
      setTotalWater(water.reduce((s, w) => s + w.amount_ml, 0));
      setFavExs(favEx);
    } catch (e) { logError("ExerciseLog", e); }
  };

  const loadExerciseDb = async () => {
    try {
      const db   = await getDb();
      const rows = await db.select<ExerciseDB[]>(
        "SELECT * FROM exercise_database ORDER BY source_type DESC, name LIMIT 200");
      setExercises(rows);
    } catch (e) { logError("ExerciseLog", e); }
  };

  const loadSessions = async () => {
    try {
      const db   = await getDb();
      const sess = await db.select<{ id: number; exercise_name: string; name_en: string | null; body_part: string | null; log_time: string }[]>(
        "SELECT id, exercise_name, name_en, body_part, log_time FROM strength_session WHERE user_id=? AND log_date=? ORDER BY log_time ASC",
        [profile!.user_id, selectedDate]);
      const result: StrengthSession[] = [];
      for (const s of sess) {
        const sets = await db.select<StrengthSet[]>(
          "SELECT * FROM strength_set WHERE session_id=? ORDER BY set_number ASC", [s.id]);
        result.push({ ...s, sets });
      }
      setSessions(result);
    } catch (e) { logError("ExerciseLog", e); }
  };

  const loadRunningSessions = async () => {
    try {
      const db   = await getDb();
      const sess = await db.select<{ id: number; log_time: string; cardio_type: string }[]>(
        "SELECT id, log_time, COALESCE(cardio_type,'running') as cardio_type FROM running_session WHERE user_id=? AND log_date=? ORDER BY log_time ASC",
        [profile!.user_id, selectedDate]);
      const result: RunningSession[] = [];
      for (const s of sess) {
        const intervals = await db.select<RunningInterval[]>(
          "SELECT * FROM running_interval WHERE session_id=? ORDER BY interval_num ASC", [s.id]);
        result.push({ ...s, intervals });
      }
      setRunningSessions(result);
    } catch (e) { logError("ExerciseLog", e); }
  };

  // ── Cardio actions ───────────────────────────────────────────────────────────

  // Recompute & persist a running session's calories from its intervals, using
  // the METS-by-type model. Keeps the stored value (read by History/Statistics)
  // in sync after any interval insert/edit/delete.
  const recomputeSessionKcal = async (db: any, sessionId: number) => {
    if (!profile) return;
    const srows = await db.select(
      "SELECT COALESCE(cardio_type,'running') as cardio_type FROM running_session WHERE id=?", [sessionId]) as { cardio_type: string }[];
    const s = srows[0];
    if (!s) return;
    const ivs = await db.select(
      "SELECT distance_km, duration_min FROM running_interval WHERE session_id=?", [sessionId]) as { distance_km: number; duration_min: number }[];
    const kcal = cardioSessionKcal(s.cardio_type as CardioKind, ivs, profile.weight_kg);
    await db.execute("UPDATE running_session SET calories_burned=? WHERE id=?", [kcal, sessionId]);
  };

  const calcKcal = (): number => {
    if (!selEx || !profile) return 0;
    const dur  = parseFloat(exDuration) || 0;
    const mets = selEx.default_mets;
    if (profile.body_fat_pct) {
      const lbm = leanBodyMass(profile.weight_kg, profile.body_fat_pct / 100);
      return Math.round(exerciseKcalLbm(mets, lbm, dur, exIntensity));
    }
    return Math.round(exerciseKcalBasic(mets, profile.weight_kg, dur, exIntensity));
  };

  const saveExercise = async () => {
    if (!selEx || !profile) return;
    setCardioErr(null);
    const err = checkBound(exDuration, BOUNDS.exDuration, lang, true);
    if (err) { setCardioErr(err); return; }
    try {
      const db = await getDb();
      await db.execute(
        `INSERT INTO exercise_log (user_id, exercise_id, exercise_name, name_en, category, duration_min, intensity, mets, calories_burned, log_date)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [profile.user_id, selEx.exercise_id, selEx.name, selEx.name_en ?? null, selEx.category,
         parseInt(exDuration), exIntensity, selEx.default_mets, calcKcal(), selectedDate]);
      setShowExForm(false); setSelEx(null); setExDuration("30"); setExSearch(""); setExFormMode("cardio");
      loadAll();
    } catch (e) {
      logError("ExerciseLog.saveExercise", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  const toggleFavEx = async (ex: ExerciseDB) => {
    if (!profile) return;
    try {
      const db = await getDb();
      const existing = await db.select<any[]>(
        "SELECT id FROM user_favorites WHERE user_id=? AND item_type='exercise' AND item_id=?",
        [profile.user_id, ex.exercise_id]);
      if (existing.length) {
        await db.execute("DELETE FROM user_favorites WHERE id=?", [existing[0].id]);
      } else {
        await db.execute(
          "INSERT INTO user_favorites (user_id, item_type, item_id) VALUES (?,?,?)",
          [profile.user_id, "exercise", ex.exercise_id]);
      }
      loadAll();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const saveCustomExercise = async () => {
    if (!exSearch.trim() || !customExKcal || !profile) return;
    const kcal = parseInt(customExKcal);
    if (!kcal) return;
    try {
      const db = await getDb();
      const name = exSearch.trim();
      const nameEn = customExNameEn.trim() || null;
      // Persist custom cardio exercise to DB for future use
      const exCat = exFormMode === "other" ? "其他" : "有氧";
      await db.execute(
        "INSERT OR IGNORE INTO exercise_database (name, name_en, category, default_mets, source_type) VALUES (?,?,?,?,?)",
        [name, nameEn, exCat, 1.0, "user"]);
      // If name_en was provided and the exercise already existed, update name_en
      if (nameEn) {
        await db.execute(
          "UPDATE exercise_database SET name_en=? WHERE name=? AND source_type='user' AND (name_en IS NULL OR name_en='')",
          [nameEn, name]);
      }
      await db.execute(
        `INSERT INTO exercise_log (user_id, exercise_name, name_en, category, duration_min, intensity, calories_burned, log_date)
         VALUES (?,?,?,?,?,?,?,?)`,
        [profile.user_id, name, nameEn, exCat,
         parseInt(customExDuration) || 30, "moderate", kcal, selectedDate]);
      setShowExForm(false); setExSearch(""); setCustomExKcal(""); setCustomExDuration("30"); setCustomExNameEn(""); setExFormMode("cardio");
      loadExerciseDb();
      loadAll();
    } catch (e) {
      logError("ExerciseLog.saveCustomExercise", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  // ── Running actions ──────────────────────────────────────────────────────────

  const saveRunningSession = async () => {
    if (!profile) return;
    const valid = runIntervals.filter(iv => iv.distance && iv.time);
    if (valid.length === 0) return;
    setRunFormErr(null);
    for (const iv of valid) {
      const errD = checkBound(iv.distance, BOUNDS.runDistance, lang, true);
      const errT = checkBound(iv.time,     BOUNDS.runTime,     lang, true);
      if (errD || errT) { setRunFormErr(errD ?? errT); return; }
    }
    try {
      const db  = await getDb();
      const ct = addCardioType || "running";
      const res = await db.execute(
        "INSERT INTO running_session (user_id, log_date, cardio_type) VALUES (?,?,?)",
        [profile.user_id, selectedDate, ct]);
      const sid = res.lastInsertId;
      for (let i = 0; i < valid.length; i++) {
        await db.execute(
          "INSERT INTO running_interval (session_id, interval_num, distance_km, duration_min) VALUES (?,?,?,?)",
          [sid, i + 1, parseFloat(valid[i].distance), parseFloat(valid[i].time)]);
      }
      await recomputeSessionKcal(db, sid as number);
      setShowRunForm(false);
      setRunIntervals([{ distance: "", time: "" }]);
      setAddCardioType("");
      loadRunningSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const addIntervalToRunning = async () => {
    if (!addRunIntervalTo) return;
    const d = parseFloat(addRunIntervalTo.d);
    const t = parseFloat(addRunIntervalTo.t);
    if (!d || !t) return;
    try {
      const db  = await getDb();
      const [cnt] = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) as c FROM running_interval WHERE session_id=?", [addRunIntervalTo.sessionId]);
      await db.execute(
        "INSERT INTO running_interval (session_id, interval_num, distance_km, duration_min) VALUES (?,?,?,?)",
        [addRunIntervalTo.sessionId, (cnt?.c ?? 0) + 1, d, t]);
      await recomputeSessionKcal(db, addRunIntervalTo.sessionId);
      setAddRunIntervalTo(null);
      loadRunningSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const saveEditRunInterval = async () => {
    if (!editingRunInterval) return;
    const d = parseFloat(editingRunInterval.distance);
    const t = parseFloat(editingRunInterval.time);
    if (!d || !t) return;
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE running_interval SET distance_km=?, duration_min=? WHERE id=?",
        [d, t, editingRunInterval.id]);
      const [srow] = await db.select<{ session_id: number }[]>(
        "SELECT session_id FROM running_interval WHERE id=?", [editingRunInterval.id]);
      if (srow) await recomputeSessionKcal(db, srow.session_id);
      setEditingRunInterval(null);
      loadRunningSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  // Delete a user-created exercise from the database (cardio or strength)
  const deleteExerciseFromDb = async (ex: ExerciseDB) => {
    if (ex.source_type !== "user") return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM user_favorites WHERE item_type='exercise' AND item_id=?", [ex.exercise_id]);
      await db.execute("DELETE FROM exercise_database WHERE exercise_id=? AND source_type='user'", [ex.exercise_id]);
      loadExerciseDb();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const deleteRunningInterval = async (id: number) => {
    try {
      const db = await getDb();
      const [srow] = await db.select<{ session_id: number }[]>(
        "SELECT session_id FROM running_interval WHERE id=?", [id]);
      await db.execute("DELETE FROM running_interval WHERE id=?", [id]);
      if (srow) await recomputeSessionKcal(db, srow.session_id);
      loadRunningSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const deleteRunningSession = async (sessionId: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM running_interval WHERE session_id=?", [sessionId]);
      await db.execute("DELETE FROM running_session WHERE id=?", [sessionId]);
      loadRunningSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  // ── Strength actions ─────────────────────────────────────────────────────────

  const saveStrengthSession = async () => {
    const name = strExName.trim();
    if (!name || !profile) return;
    const validSets = strSets.filter(s => s.weight && s.reps);
    if (validSets.length === 0) return;
    // Custom exercise (not in DB): require body_part
    const isCustom = !exercises.some(e => e.name === name && e.category === "重訓");
    if (isCustom && !strBodyPart) { setStrBodyPartError(true); return; }
    setStrBodyPartError(false);
    setStrFormErr(null);
    for (const s of validSets) {
      const errW = checkBound(s.weight, BOUNDS.strWeight, lang, true);
      const errR = checkBound(s.reps,   BOUNDS.strReps,   lang, true);
      if (errW || errR) { setStrFormErr(errW ?? errR); return; }
    }
    try {
      const db  = await getDb();
      // If custom, save to exercise_database for future use
      if (isCustom && strBodyPart) {
        const customNameEn = strExNameEn.trim() || null;
        await db.execute(
          "INSERT OR IGNORE INTO exercise_database (name, name_en, category, default_mets, body_part, source_type) VALUES (?,?,?,?,?,?)",
          [name, customNameEn, "重訓", 1.0, strBodyPart, "user"]);
        if (customNameEn) {
          await db.execute(
            "UPDATE exercise_database SET name_en=? WHERE name=? AND source_type='user' AND (name_en IS NULL OR name_en='')",
            [customNameEn, name]);
        }
        loadExerciseDb();
      }
      // Look up name_en from the exercise database
      const matchEx = exercises.find(e => e.name === name);
      const nameEn = matchEx?.name_en ?? null;
      const res = await db.execute(
        "INSERT INTO strength_session (user_id, exercise_name, name_en, body_part, log_date) VALUES (?,?,?,?,?)",
        [profile.user_id, name, nameEn, strBodyPart || null, selectedDate]);
      const sid = res.lastInsertId;
      for (let i = 0; i < validSets.length; i++) {
        await db.execute(
          "INSERT INTO strength_set (session_id, set_number, weight_kg, reps) VALUES (?,?,?,?)",
          [sid, i + 1, parseFloat(validSets[i].weight), parseInt(validSets[i].reps)]);
      }
      setShowStrength(false);
      setStrExName(""); setStrSearch(""); setStrBodyPart(""); setStrExNameEn("");
      setStrSets([{ weight: "", reps: "" }]);
      loadSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const addSetToSession = async () => {
    if (!addSetTo) return;
    const w = parseFloat(addSetTo.w);
    const r = parseInt(addSetTo.r);
    if (!w || !r) return;
    setAddSetErr(null);
    const errW = checkBound(addSetTo.w, BOUNDS.strWeight, lang, true);
    const errR = checkBound(addSetTo.r, BOUNDS.strReps,   lang, true);
    if (errW || errR) { setAddSetErr(errW ?? errR); return; }
    try {
      const db  = await getDb();
      const [cnt] = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) as c FROM strength_set WHERE session_id=?", [addSetTo.sessionId]);
      await db.execute(
        "INSERT INTO strength_set (session_id, set_number, weight_kg, reps) VALUES (?,?,?,?)",
        [addSetTo.sessionId, (cnt?.c ?? 0) + 1, w, r]);
      setAddSetTo(null);
      loadSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const deleteSet = async (setId: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM strength_set WHERE id=?", [setId]);
      loadSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const deleteSession = async (sessionId: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM strength_set WHERE session_id=?", [sessionId]);
      await db.execute("DELETE FROM strength_session WHERE id=?", [sessionId]);
      loadSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  // ── Water / Weight actions ───────────────────────────────────────────────────

  const addWater = async (ml: number) => {
    if (!profile) return;
    try {
      const db = await getDb();
      const time = waterTime + ":00";
      await db.execute(
        "INSERT INTO water_log (user_id, amount_ml, log_date, log_time) VALUES (?,?,?,?)",
        [profile.user_id, ml, selectedDate, time]);
      loadAll();
    } catch (e) { logError("ExerciseLog", e); }
  };

  // ── Inline edit save handlers ────────────────────────────────────────────────

  const saveEditEx = async () => {
    if (!editingEx || !profile) return;
    const dur = parseInt(editingEx.duration) || 0;
    try {
      const db = await getDb();
      const [row] = await db.select<{ mets: number }[]>("SELECT mets FROM exercise_log WHERE id=?", [editingEx.id]);
      const mets = row?.mets ?? 5.0;
      let kcal: number;
      if (profile.body_fat_pct) {
        const lbm = leanBodyMass(profile.weight_kg, profile.body_fat_pct / 100);
        kcal = Math.round(exerciseKcalLbm(mets, lbm, dur, editingEx.intensity));
      } else {
        kcal = Math.round(exerciseKcalBasic(mets, profile.weight_kg, dur, editingEx.intensity));
      }
      await db.execute(
        "UPDATE exercise_log SET duration_min=?, intensity=?, calories_burned=? WHERE id=?",
        [dur, editingEx.intensity, kcal, editingEx.id]);
      setEditingEx(null);
      loadAll();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const saveEditSession = async () => {
    if (!editingSession) return;
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE strength_session SET exercise_name=?, body_part=? WHERE id=?",
        [editingSession.name.trim(), editingSession.bodyPart || null, editingSession.id]);
      setEditingSession(null);
      loadSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const saveEditSet = async () => {
    if (!editingSet) return;
    const w = parseFloat(editingSet.weight);
    const r = parseInt(editingSet.reps);
    if (!w || !r) return;
    try {
      const db = await getDb();
      await db.execute("UPDATE strength_set SET weight_kg=?, reps=? WHERE id=?", [w, r, editingSet.id]);
      setEditingSet(null);
      loadSessions();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const saveEditWater = async () => {
    if (!editingWater) return;
    const ml = parseInt(editingWater.amount) || 0;
    if (!ml) return;
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE water_log SET amount_ml=?, log_time=? WHERE id=?",
        [ml, editingWater.time + ":00", editingWater.id]);
      setEditingWater(null);
      loadAll();
    } catch (e) { logError("ExerciseLog", e); }
  };

  const strengthExs = exercises.filter(e => e.category === "重訓");
  // Cardio picker: exclude 重訓 (has its own tab); also exclude user-created strength exercises
  const filteredAll = exSearch
    ? exercises.filter(e => (e.name.includes(exSearch) || e.name_en?.toLowerCase().includes(exSearch.toLowerCase())) && e.category !== "重訓")
    : exercises.filter(e => e.category !== "重訓");

  const filteredSessions = strFilterPart === "全部"
    ? sessions
    : sessions.filter(s => s.body_part === strFilterPart);

  const otherEntries = exEntries.filter(e =>
    e.category !== "有氧" && e.category !== "重訓" && e.category !== "自訂");
  const filteredOther = exFormMode === "other"
    ? (exSearch
        ? exercises.filter(e => (e.name.includes(exSearch) || e.name_en?.toLowerCase().includes(exSearch.toLowerCase())) && e.category !== "有氧" && e.category !== "重訓")
        : exercises.filter(e => e.category !== "有氧" && e.category !== "重訓"))
    : filteredAll;

  // Modal dropdown: filter by strBodyPart (the modal's tag selector), not strFilterPart
  const filteredStrModal = strSearch
    ? strengthExs.filter(e => e.name.includes(strSearch) || e.name_en?.toLowerCase().includes(strSearch.toLowerCase()) || e.body_part?.includes(strSearch))
    : strBodyPart
      ? strengthExs.filter(e => e.body_part === strBodyPart)
      : strengthExs;

  const previewKcal = calcKcal();
  const totalStrVol = sessions.reduce((s, sess) => s + sess.sets.reduce((a, st) => a + st.weight_kg * st.reps, 0), 0);

  const wt = profile?.weight_kg ?? 70;
  const totalStrKcal = sessions.reduce((sum, sess) => sum + strengthEstKcal(sess.sets.length, wt), 0);

  // Running totals
  const totalRunKm = runningSessions.reduce((s, sess) =>
    s + sess.intervals.reduce((a, iv) => a + iv.distance_km, 0), 0);
  const totalRunMin = runningSessions.reduce((s, sess) =>
    s + sess.intervals.reduce((a, iv) => a + iv.duration_min, 0), 0);
  const totalRunKcal = runningSessions.reduce((sum, sess) =>
    sum + cardioSessionKcal((sess.cardio_type || "running") as CardioKind, sess.intervals, wt), 0);
  const totalAllKcal = totalExKcal + totalStrKcal + totalRunKcal;

  const filteredRunningSessions = cardioFilter === "all"
    ? runningSessions
    : runningSessions.filter(s => s.cardio_type === cardioFilter);

  // Pace formatter: duration_min / distance_km → "M:SS/km"
  const formatPace = (distKm: number, durMin: number): string => {
    if (distKm <= 0) return "--";
    const p = durMin / distKm;
    return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")}/km`;
  };

  const INTENSITY_LABELS_T: Record<Intensity, string> = {
    light: t("exercise.light"),
    moderate: t("exercise.moderate"),
    intense: t("exercise.intense"),
  };


  const TABS: { key: Tab; label: string }[] = [
    { key: "cardio",   label: t("exercise.tabActivity") },
    { key: "running",  label: t("exercise.running") },
    { key: "strength", label: t("exercise.strength") },
    { key: "other",    label: lang === "zh" ? "其他" : "Other" },
    { key: "water",    label: t("exercise.water") },
  ];

  if (!profile) return <NoProfile />;


  return (
    <div className="pt-4 md:pt-6 px-4 md:px-6 max-w-2xl mx-auto pb-36 md:pb-6" {...exSwipe}>
      {/* Sticky header */}
      <DateNavHeader
        title={t("exercise.pageTitle")}
        historyTitle={t("exercise.historyTitle")}
        selectedDate={selectedDate}
        todayStr={todayStr}
        onDateChange={setSelectedDate}
        onHistory={() => setHistoryOpen(true)}
      />

      {/* History drawer */}
      <ExerciseHistoryDrawer
        open={historyOpen}
        userId={profile!.user_id}
        onClose={() => setHistoryOpen(false)}
        onSelectDate={date => { setSelectedDate(date); setHistoryOpen(false); }}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-white/10 p-1 rounded-xl mb-5">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx("flex-1 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              tab === key ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════
          運動 TAB
      ══════════════════════════════════════════════ */}
      {tab === "cardio" && (
        <div className="space-y-3">
          {/* Total consumption: cardio + running + strength */}
          <div className="card flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-500">
              <Dumbbell size={18} />
              <span className="text-sm font-medium">{t("exercise.todayBurn")}</span>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-[var(--text-on-surface)]">{Math.round(totalAllKcal)} kcal</p>
              {(totalStrKcal > 0 || totalRunKcal > 0) && (
                <p className="text-[10px] text-[var(--text-on-surface-muted)]">
                  {[
                    totalExKcal > 0 && `${t("exercise.tabActivity")} ${Math.round(totalExKcal)}`,
                    totalRunKcal > 0 && `${t("exercise.running")} ${totalRunKcal}`,
                    totalStrKcal > 0 && `${t("exercise.strength")} ${totalStrKcal}`,
                  ].filter(Boolean).join(" + ")}
                </p>
              )}
            </div>
          </div>

          {/* Logged exercise entries */}
          {exEntries.map(e => (
            <ExerciseEntryCard key={e.id} e={e} editingEx={editingEx} setEditingEx={setEditingEx}
              saveEditEx={saveEditEx} onDelete={async () => { await deleteExerciseEntry(e.id); loadAll(); }}
              kcalColor="text-orange-500" intensityLabels={INTENSITY_LABELS_T} t={t} exName={exName} catLabel={catLabel} />
          ))}

          {/* Cardio (有氧) summary reference */}
          {runningSessions.length > 0 && (
            <div className="card bg-[var(--surface)] border border-green-100 cursor-pointer" onClick={() => setTab("running")}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-green-700">
                  🏃 {lang === "zh" ? "今日有氧" : "Today's Cardio"} · {totalRunKm.toFixed(2)} km · {Math.floor(totalRunMin)}:{String(Math.round(totalRunMin % 1 * 60)).padStart(2,"0")} min · {totalRunKcal} kcal
                </p>
                <span className="text-[10px] text-green-400">{t("exercise.included")}</span>
              </div>
            </div>
          )}

          {/* Strength sessions summary (read-only reference) */}
          {sessions.length > 0 && (
            <div className="card bg-[var(--surface)] border border-violet-100 cursor-pointer" onClick={() => setTab("strength") }>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-violet-700">
                  {t("exercise.strength")} {sessions.length} {t("exercise.moves")} · {t("exercise.estKcal")} {totalStrKcal} kcal
                </p>
                <span className="text-[10px] text-violet-400">{t("exercise.included")}</span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ══════════════════════════════════════════════
          CARDIO TAB (有氧: 跑步 / 游泳 / 自行車)
      ══════════════════════════════════════════════ */}
      {tab === "running" && (
        <div className="space-y-3">
          {/* Sub-filter chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {CARDIO_FILTERS.map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => setCardioFilter(key)}
                className={clsx(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                  cardioFilter === key
                    ? "bg-green-500 text-white shadow-sm"
                    : "bg-white/10 text-[var(--text-on-bg-muted)] hover:bg-white/20"
                )}>
                {emoji && <span>{emoji}</span>}
                {lang === "zh" ? label : (key === "all" ? "All" : key === "running" ? "Run" : key === "swimming" ? "Swim" : "Ride")}
              </button>
            ))}
          </div>

          {/* Summary card */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-green-500">
                <span className="text-lg leading-none">
                  {cardioFilter === "all" ? "🏃" : CARDIO_EMOJI[cardioFilter]}
                </span>
                <span className="text-sm font-medium">{t("exercise.todayRun")}</span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-[var(--text-on-surface)]">
                  {totalRunKm.toFixed(2)} <span className="text-sm font-normal text-[var(--text-on-surface-muted)]">km</span>
                </p>
                {totalRunMin > 0 && (
                  <p className="text-xs text-[var(--text-on-surface-muted)]">
                    {Math.floor(totalRunMin)}:{String(Math.round(totalRunMin % 1 * 60)).padStart(2, "0")} min
                    {cardioFilter === "running" && totalRunKm > 0 && ` · ${t("exercise.avgPace")} ${formatPace(totalRunKm, totalRunMin)}`}
                    {cardioFilter === "cycling" && totalRunKm > 0 && ` · ${(totalRunKm / (totalRunMin / 60)).toFixed(1)} km/h`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Session list */}
          {filteredRunningSessions.map((sess, si) => {
            const sessKm  = sess.intervals.reduce((a, iv) => a + iv.distance_km, 0);
            const sessMin = sess.intervals.reduce((a, iv) => a + iv.duration_min, 0);
            const typeEmoji = CARDIO_EMOJI[sess.cardio_type] ?? "🏃";
            const typeLabel = lang === "zh"
              ? (CARDIO_LABEL[sess.cardio_type]?.zh ?? sess.cardio_type)
              : (CARDIO_LABEL[sess.cardio_type]?.en ?? sess.cardio_type);
            return (
              <div key={sess.id} className="card p-0 overflow-hidden">
                {/* Session header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--surface-border)]">
                  <span className="text-base leading-none">{typeEmoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[var(--text-on-surface)]">
                      {typeLabel} {lang === "zh" ? `第 ${si + 1} 段` : `Session ${si + 1}`}
                    </p>
                    <p className="text-xs text-[var(--text-on-surface-muted)]">
                      {sessKm.toFixed(2)} km · {Math.floor(sessMin)}:{String(Math.round(sessMin % 1 * 60)).padStart(2, "0")} min
                      {sess.cardio_type === "running" && sessKm > 0 && ` · ${formatPace(sessKm, sessMin)}`}
                      {sess.cardio_type === "cycling" && sessKm > 0 && ` · ${(sessKm / (sessMin / 60)).toFixed(1)} km/h`}
                    </p>
                  </div>
                  <button onClick={() => deleteRunningSession(sess.id)}
                    className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Interval rows */}
                <div className="divide-y divide-[var(--surface-border)]">
                  {sess.intervals.map((iv, idx) => (
                    <div key={iv.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs font-semibold text-[var(--text-on-surface-muted)] w-8 shrink-0">
                        {lang === "zh" ? `第 ${idx + 1}` : `${idx + 1}`}
                      </span>
                      {editingRunInterval?.id === iv.id ? (
                        <>
                          <div className="relative flex-1">
                            <input className="input-base py-1 pr-8 text-sm" type="number" inputMode="decimal" step="0.01"
                              value={editingRunInterval.distance}
                              onChange={ev => setEditingRunInterval(x => x ? { ...x, distance: ev.target.value } : null)} />
                            <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">km</span>
                          </div>
                          <span className="text-[var(--text-on-surface-muted)] text-xs">@</span>
                          <div className="relative flex-1">
                            <input className="input-base py-1 pr-8 text-sm" type="number" inputMode="decimal"
                              value={editingRunInterval.time}
                              onChange={ev => setEditingRunInterval(x => x ? { ...x, time: ev.target.value } : null)} />
                            <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">min</span>
                          </div>
                          <button onClick={saveEditRunInterval} className="p-1 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditingRunInterval(null)} className="p-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-[var(--text-on-surface)]">
                            <span className="font-bold">{iv.distance_km}</span>
                            <span className="text-[var(--text-on-surface-muted)] text-xs"> km</span>
                          </span>
                          <span className="text-xs text-[var(--text-on-surface-muted)]">{iv.duration_min} min</span>
                          {sess.cardio_type === "running" && (
                            <span className="text-xs text-green-500 font-medium w-16 text-right">
                              {formatPace(iv.distance_km, iv.duration_min)}
                            </span>
                          )}
                          {sess.cardio_type === "cycling" && (
                            <span className="text-xs text-blue-500 font-medium w-16 text-right">
                              {iv.duration_min > 0 ? `${(iv.distance_km / (iv.duration_min / 60)).toFixed(1)} km/h` : "--"}
                            </span>
                          )}
                          <button onClick={() => setEditingRunInterval({ id: iv.id, distance: String(iv.distance_km), time: String(iv.duration_min) })}
                            className="p-1 text-yellow-400 hover:text-yellow-500 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => deleteRunningInterval(iv.id)}
                            className="p-1 text-red-400 hover:text-red-500 transition-colors">
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add interval inline */}
                {addRunIntervalTo?.sessionId === sess.id ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border-t border-[var(--surface-border)]">
                    <div className="relative flex-1">
                      <input className="input-base py-1.5 pr-8 text-sm" type="number" inputMode="decimal" step="0.01" placeholder={t("exercise.distance")}
                        value={addRunIntervalTo.d}
                        onChange={e => setAddRunIntervalTo(a => a ? { ...a, d: e.target.value } : null)} />
                      <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">km</span>
                    </div>
                    <span className="text-[var(--text-on-surface-muted)] text-xs">@</span>
                    <div className="relative flex-1">
                      <input className="input-base py-1.5 pr-8 text-sm" type="number" inputMode="decimal" placeholder={t("exercise.duration")}
                        value={addRunIntervalTo.t}
                        onChange={e => setAddRunIntervalTo(a => a ? { ...a, t: e.target.value } : null)} />
                      <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">min</span>
                    </div>
                    {addRunIntervalTo.d && addRunIntervalTo.t && sess.cardio_type === "running" && (
                      <span className="text-xs text-green-500 font-medium shrink-0">
                        {formatPace(parseFloat(addRunIntervalTo.d) || 0, parseFloat(addRunIntervalTo.t) || 0)}
                      </span>
                    )}
                    <button onClick={addIntervalToRunning}
                      className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium shrink-0">{t("common.confirm")}</button>
                    <button onClick={() => setAddRunIntervalTo(null)} className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setAddRunIntervalTo({ sessionId: sess.id, d: "", t: "" })}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] hover:bg-[var(--surface-container-low)] transition-colors border-t border-[var(--surface-border)]">
                    <Plus size={12} /> {t("exercise.addIntervalBtn")}
                  </button>
                )}
              </div>
            );
          })}

          {filteredRunningSessions.length === 0 && runningSessions.length > 0 && (
            <p className="text-center text-xs text-[var(--text-on-bg-muted)] py-4">
              {lang === "zh" ? "目前篩選無資料" : "No sessions for this filter"}
            </p>
          )}

          <button
            onClick={() => {
              setAddCardioType(cardioFilter !== "all" ? (cardioFilter as CardioType) : "");
              setRunIntervals([{ distance: "", time: "" }]);
              setShowRunForm(true);
            }}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-medium">
            <Plus size={16} /> {t("exercise.addRun")}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STRENGTH TAB
      ══════════════════════════════════════════════ */}
      {tab === "strength" && (
        <div className="space-y-3">
          {/* Summary + body part filter */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-violet-500">
                <Dumbbell size={18} />
                <span className="text-sm font-medium">{t("exercise.todayStrVol")}</span>
              </div>
              <p className="text-xl font-bold text-[var(--text-on-surface)]">{Math.round(totalStrVol)} <span className="text-sm font-normal text-[var(--text-on-surface-muted)]">kg</span></p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["全部", ...BODY_PARTS] as const).map(p => (
                <button key={p} onClick={() => setStrFilterPart(p)}
                  className={clsx("px-3 py-1 rounded-full text-xs font-medium transition-all",
                    strFilterPart === p
                      ? "text-white"
                      : "bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] hover:bg-[var(--surface-container)]")}
                  style={strFilterPart === p && p !== "全部"
                    ? { backgroundColor: BODY_PART_COLORS[p] }
                    : strFilterPart === p
                      ? { backgroundColor: "var(--color-primary)" }
                      : {}}>
                  {p === "全部" ? t("common.all") : bpLabel(p)}
                </button>
              ))}
            </div>
          </div>

          {filteredSessions.length === 0 && (
            <div className="text-center py-10 text-[var(--text-on-bg-muted)]">
              <Dumbbell size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {strFilterPart === "全部"
                ? t("exercise.noStrToday")
                : (lang === "zh"
                    ? `今日無${bpLabel(strFilterPart)}部位記錄`
                    : `No ${bpLabel(strFilterPart)} sessions today`)}
              </p>
            </div>
          )}

          {filteredSessions.map(sess => {
            const vol = sess.sets.reduce((s, st) => s + st.weight_kg * st.reps, 0);
            const partColor = sess.body_part ? BODY_PART_COLORS[sess.body_part] : "#9ca3af";
            return (
              <div key={sess.id} className="card p-0 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--surface-border)]">
                  {editingSession?.id === sess.id ? (
                    /* ── Inline edit: session name + body part ── */
                    <div className="flex-1 flex items-center gap-2">
                      <input className="input-base py-1.5 text-sm flex-1" placeholder={t("exercise.exName")}
                        value={editingSession.name}
                        onChange={ev => setEditingSession(s => s ? { ...s, name: ev.target.value } : null)} />
                      <select className="input-base py-1.5 text-sm w-24"
                        value={editingSession.bodyPart}
                        onChange={ev => setEditingSession(s => s ? { ...s, bodyPart: ev.target.value } : null)}>
                        <option value="">{t("exercise.bodyPart")}</option>
                        {BODY_PARTS.map(p => <option key={p} value={p}>{bpLabel(p)}</option>)}
                      </select>
                      <button onClick={saveEditSession} className="p-1.5 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditingSession(null)} className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    /* ── Normal view ── */
                    <>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[var(--text-on-surface)]">{exName(sess)}</p>
                          {sess.body_part && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: partColor }}>
                              {bpLabel(sess.body_part)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-on-surface-muted)]">
                          {sess.sets.length} {t("exercise.setLabel")} · {t("exercise.totalVol")} {Math.round(vol)} kg
                        </p>
                      </div>
                      <button onClick={() => setEditingSession({ id: sess.id, name: sess.exercise_name, bodyPart: sess.body_part ?? "" })}
                        className="p-1.5 text-yellow-400 hover:text-yellow-500 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteSession(sess.id)}
                        className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>

                <div className="divide-y divide-[var(--surface-border)]">
                  {sess.sets.map((st, idx) => (
                    <div key={st.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs font-semibold text-[var(--text-on-surface-muted)] w-8 shrink-0">
                        {lang === "zh" ? `第 ${idx + 1} 組` : `${t("exercise.setLabel")} ${idx + 1}`}
                      </span>
                      {editingSet?.id === st.id ? (
                        /* ── Inline edit: weight + reps ── */
                        <>
                          <div className="relative flex-1">
                            <input className="input-base py-1 pr-7 text-sm" type="number" inputMode="decimal"
                              value={editingSet.weight}
                              onChange={ev => setEditingSet(s => s ? { ...s, weight: ev.target.value } : null)} />
                            <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">kg</span>
                          </div>
                          <span className="text-[var(--text-on-surface-muted)] text-xs">×</span>
                          <div className="relative flex-1">
                            <input className="input-base py-1 pr-7 text-sm" type="number" inputMode="decimal"
                              value={editingSet.reps}
                              onChange={ev => setEditingSet(s => s ? { ...s, reps: ev.target.value } : null)} />
                            <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "下" : "reps"}</span>
                          </div>
                          <button onClick={saveEditSet} className="p-1 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setEditingSet(null)} className="p-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        /* ── Normal view ── */
                        <>
                          <span className="flex-1 text-sm text-[var(--text-on-surface)]">
                            <span className="font-bold">{st.weight_kg}</span>
                            <span className="text-[var(--text-on-surface-muted)] text-xs"> kg × </span>
                            <span className="font-bold">{st.reps}</span>
                            <span className="text-[var(--text-on-surface-muted)] text-xs"> {lang === "zh" ? "下" : "reps"}</span>
                          </span>
                          <span className="text-xs text-[var(--text-on-surface-muted)]">
                            {Math.round(st.weight_kg * st.reps)} kg
                          </span>
                          <button onClick={() => setEditingSet({ id: st.id, weight: String(st.weight_kg), reps: String(st.reps) })}
                            className="p-1 text-yellow-400 hover:text-yellow-500 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => deleteSet(st.id)}
                            className="p-1 text-red-400 hover:text-red-500 transition-colors">
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {addSetTo?.sessionId === sess.id ? (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-container-low)] border-t border-[var(--surface-border)]">
                      <div className="relative flex-1">
                        <input className="input-base py-1.5 pr-8 text-sm" type="number" inputMode="decimal" placeholder={t("exercise.weightKg")}
                          value={addSetTo.w}
                          onChange={e => setAddSetTo(a => a ? { ...a, w: e.target.value } : null)} />
                        <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">kg</span>
                      </div>
                      <span className="text-[var(--text-on-surface-muted)]">×</span>
                      <div className="relative flex-1">
                        <input className="input-base py-1.5 pr-8 text-sm" type="number" inputMode="decimal" placeholder={t("exercise.reps")}
                          value={addSetTo.r}
                          onChange={e => setAddSetTo(a => a ? { ...a, r: e.target.value } : null)} />
                        <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "下" : "reps"}</span>
                      </div>
                      <button onClick={addSetToSession}
                        className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium">{t("common.confirm")}</button>
                      <button onClick={() => { setAddSetTo(null); setAddSetErr(null); }}
                        className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                        <X size={14} />
                      </button>
                    </div>
                    {addSetErr && (
                      <p className="text-xs text-red-500 flex items-center gap-1 px-4 pb-2">
                        <AlertCircle size={12} className="shrink-0" /> {addSetErr}
                      </p>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => setAddSetTo({ sessionId: sess.id, w: "", r: "" })}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] hover:bg-[var(--surface-container-low)] transition-colors border-t border-[var(--surface-border)]">
                    <Plus size={12} /> {t("exercise.addSet")}
                  </button>
                )}
              </div>
            );
          })}

          <button onClick={() => setShowStrength(true)}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-medium">
            <Plus size={16} /> {t("exercise.addStrength")}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          OTHER TAB (其他)
      ══════════════════════════════════════════════ */}
      {tab === "other" && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="card flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-on-surface-muted)]">
              <span className="text-lg leading-none">🏅</span>
              <span className="text-sm font-medium">{lang === "zh" ? "其他運動" : "Other Activities"}</span>
            </div>
            <p className="text-xl font-bold text-[var(--text-on-surface)]">
              {Math.round(otherEntries.reduce((s, e) => s + (e.calories_burned ?? 0), 0))}
              <span className="text-sm font-normal text-[var(--text-on-surface-muted)]"> kcal</span>
            </p>
          </div>

          {/* Entries list */}
          {otherEntries.map(e => (
            <ExerciseEntryCard key={e.id} e={e} editingEx={editingEx} setEditingEx={setEditingEx}
              saveEditEx={saveEditEx} onDelete={async () => { await deleteExerciseEntry(e.id); loadAll(); }}
              kcalColor="text-[var(--text-on-surface-sub)]" intensityLabels={INTENSITY_LABELS_T} t={t} exName={exName} catLabel={catLabel} />
          ))}

          <button onClick={() => { setExFormMode("other"); setShowExForm(true); setExSearch(""); setSelEx(null); }}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm font-medium">
            <Plus size={16} /> {lang === "zh" ? "新增其他運動" : "Add other activity"}
          </button>
        </div>
      )}

      {/* ── WATER TAB ── */}
      {tab === "water" && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-blue-500">
                <Droplets size={18} />
                <span className="text-sm font-medium">{t("exercise.todayWater")}</span>
              </div>
              {(() => {
                const wGoal = modeSettings?.water_goal_ml ?? 2000;
                const wOver = totalWater > wGoal;
                return (
                  <>
                    <p className="text-xl font-bold text-[var(--text-on-surface)]">
                      {(totalWater / 1000).toFixed(1)}
                      <span className="text-sm font-normal text-[var(--text-on-surface-muted)]"> / {(wGoal / 1000).toFixed(1)} L</span>
                    </p>
                    {wOver
                      ? <p className="text-xs text-blue-500 font-medium mt-0.5">{t("exercise.goalMet")}</p>
                      : <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">
                          {lang === "zh"
                            ? `剩 ${((wGoal - totalWater) / 1000).toFixed(1)} L`
                            : `${((wGoal - totalWater) / 1000).toFixed(1)} L left`}
                        </p>
                    }
                  </>
                );
              })()}
            </div>
            {(() => {
              const wGoal = modeSettings?.water_goal_ml ?? 2000;
              return (
                <div className="h-3 bg-[var(--surface-container)] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${Math.min((totalWater / wGoal) * 100, 100)}%` }} />
                </div>
              );
            })()}
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--text-on-bg-muted)] mb-2">{t("exercise.quickAdd")}</p>
            <div className="grid grid-cols-4 gap-2">
              {WATER_PRESETS.map(ml => (
                <button key={ml} onClick={() => addWater(ml)}
                  className="py-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium text-[var(--text-on-bg)] transition-all">
                  {ml} ml
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[120px]">
              <input className="input-base pr-10" type="number" inputMode="decimal" placeholder={t("common.custom")} value={waterAmount}
                onChange={e => { setWaterAmount(e.target.value); setWaterAddErr(null); }} />
              <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">ml</span>
            </div>
            <TimePicker value={waterTime} onChange={setWaterTime} />
            <button onClick={() => {
              const err = checkBound(waterAmount, BOUNDS.waterMl, lang, true);
              if (err) { setWaterAddErr(err); return; }
              setWaterAddErr(null);
              addWater(parseInt(waterAmount) || 0);
            }} className="btn-primary px-5">{t("common.add")}</button>
          </div>
          {waterAddErr && (
            <p className="text-xs text-red-500 flex items-center gap-1 -mt-1">
              <AlertCircle size={12} className="shrink-0" /> {waterAddErr}
            </p>
          )}

          <div className="space-y-2">
            {waterEntries.map(w => {
              const isSynced = w.meal_log_id != null;
              return (
                <div key={w.id} className="flex items-center justify-between py-2 px-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                  {editingWater?.id === w.id ? (
                    /* ── Inline edit (manual only) ── */
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <Droplets size={14} className="text-blue-400 shrink-0" />
                      <div className="relative max-w-[110px]">
                        <input className="input-base py-1 pr-8 text-sm" type="number" inputMode="decimal"
                          value={editingWater.amount}
                          onChange={ev => setEditingWater(x => x ? { ...x, amount: ev.target.value } : null)} />
                        <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">ml</span>
                      </div>
                      <TimePicker value={editingWater.time}
                        onChange={v => setEditingWater(x => x ? { ...x, time: v } : null)} />
                      <button onClick={saveEditWater} className="p-1 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingWater(null)} className="p-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    /* ── Normal view ── */
                    <>
                      <div className="flex items-center gap-2">
                        <Droplets size={14} className={isSynced ? "text-blue-300" : "text-blue-400"} />
                        <span className="text-sm text-[var(--text-on-surface-sub)]">{w.amount_ml} ml</span>
                        {isSynced && (
                          <span className="text-[10px] text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded-full">
                            {lang === "en" ? "meal sync" : "餐食同步"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-on-surface-muted)]">{w.log_time?.slice(0, 5)}</span>
                        {!isSynced && (
                          <>
                            <button
                              onClick={() => setEditingWater({ id: w.id, amount: String(w.amount_ml), time: w.log_time?.slice(0, 5) ?? format(new Date(), "HH:mm") })}
                              className="text-yellow-400 hover:text-yellow-500 p-0.5 transition-colors">
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={async () => { await deleteWaterEntry(w.id); loadAll(); }}
                              className="text-red-400 hover:text-red-500 p-0.5 transition-colors">
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          CARDIO SEARCH MODAL
      ════════════════════════════════════════════ */}
      {showExForm && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-4 pb-16 sm:pb-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            {/* Search bar */}
            <div className="flex items-center gap-3 p-4 border-b border-[var(--surface-border)] shrink-0">
              <input autoFocus value={exSearch} onChange={e => setExSearch(e.target.value)}
                className="input-base flex-1" placeholder={t("exercise.search")} />
              <button onClick={() => { setShowExForm(false); setSelEx(null); setExSearch(""); setExFormMode("cardio"); }}
                className="p-2 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><X size={18} /></button>
            </div>

            {/* Scrollable exercise list */}
            <div className="overflow-y-auto flex-1">
              {!exSearch && favExs.length > 0 && (
                <div className="p-3">
                  <p className="text-xs font-medium text-[var(--text-on-surface-muted)] uppercase tracking-wide px-1 mb-2">{t("exercise.frequent")}</p>
                  {favExs.map(e => (
                    <ExRow key={e.exercise_id} ex={e} onSelect={setSelEx} onFav={toggleFavEx}
                      isFav={true} isSelected={selEx?.exercise_id === e.exercise_id} />
                  ))}
                </div>
              )}
              <div className="p-3">
                {exSearch
                  ? <p className="text-xs font-medium text-[var(--text-on-surface-muted)] uppercase tracking-wide px-1 mb-2">{t("exercise.searchResults")}</p>
                  : <p className="text-xs font-medium text-[var(--text-on-surface-muted)] uppercase tracking-wide px-1 mb-2">{t("exercise.allExercises")}</p>
                }
                {(exFormMode === "other" ? filteredOther : filteredAll).map(e => (
                  <ExRow key={e.exercise_id} ex={e} onSelect={setSelEx} onFav={toggleFavEx}
                    isFav={favExs.some(f => f.exercise_id === e.exercise_id)}
                    isSelected={selEx?.exercise_id === e.exercise_id}
                    onDelete={deleteExerciseFromDb} />
                ))}
                {exSearch && filteredAll.length === 0 && (
                  <div className="px-2 py-3">
                    <p className="text-xs text-[var(--text-on-surface-muted)] mb-3">
                      {lang === "zh" ? `找不到「${exSearch}」` : `No results for "${exSearch}"`}
                    </p>
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 space-y-2.5">
                      {/* Exercise name (from search, used as exercise name) */}
                      <div>
                        <p className="text-[11px] text-amber-600 font-medium mb-1">
                          {lang === "zh" ? "運動名稱" : "Exercise name"}
                        </p>
                        <p className="text-sm font-semibold text-[var(--text-on-surface)] px-1">{exSearch}</p>
                      </div>
                      {/* Optional English name */}
                      <div>
                        <p className="text-[11px] text-amber-600 font-medium mb-1">
                          {lang === "zh" ? "英文名稱（選填）" : "English name (optional)"}
                        </p>
                        <input className="input-base py-1.5 text-sm bg-white"
                          placeholder={lang === "en" ? "e.g. Jump Rope" : "e.g. Jump Rope"}
                          value={customExNameEn}
                          onChange={e => setCustomExNameEn(e.target.value)} />
                      </div>
                      {/* Calories & duration */}
                      <div>
                        <p className="text-[11px] text-amber-600 font-medium mb-1">
                          {lang === "zh" ? "本次紀錄" : "This session"}
                        </p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input className="input-base py-1.5 pr-10 text-sm" type="number" inputMode="decimal"
                              placeholder={t("exercise.kcalRequired")}
                              value={customExKcal}
                              onChange={e => setCustomExKcal(e.target.value)} />
                            <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">kcal</span>
                          </div>
                          <div className="relative w-24">
                            <input className="input-base py-1.5 pr-10 text-sm" type="number" inputMode="decimal"
                              placeholder={t("exercise.durationLabel")}
                              value={customExDuration}
                              onChange={e => setCustomExDuration(e.target.value)} />
                            <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">min</span>
                          </div>
                        </div>
                        {!customExKcal && (
                          <p className="text-[10px] text-red-500 mt-1">{t("exercise.kcalWarning")}</p>
                        )}
                      </div>
                      <button
                        onClick={saveCustomExercise}
                        disabled={!customExKcal}
                        className="w-full py-2 rounded-xl bg-amber-500 text-white text-sm font-medium disabled:opacity-40 transition-opacity">
                        {lang === "zh" ? "新增自訂運動" : "Add custom exercise"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Selected exercise — sticky bottom panel */}
            {selEx && (
              <div className="border-t border-[var(--surface-border)] bg-[var(--surface-container-low)] p-4 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-on-surface)] truncate">{(lang === "en" && selEx.name_en) ? selEx.name_en : selEx.name}</p>
                    {selEx.category === "重訓" && selEx.body_part && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white shrink-0"
                        style={{ backgroundColor: BODY_PART_COLORS[selEx.body_part] ?? "#8b5cf6" }}>
                        {bpLabel(selEx.body_part)}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setSelEx(null)} className="p-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] shrink-0 ml-2">
                    <X size={14} />
                  </button>
                </div>

                {selEx.category === "重訓" && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-violet-50 rounded-xl border border-violet-100">
                    <Dumbbell size={13} className="text-violet-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-violet-700">{t("exercise.strHint")}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input className="input-base pr-10" type="number" inputMode="decimal" value={exDuration}
                      onChange={e => setExDuration(e.target.value)} placeholder={t("exercise.durationLabel")} />
                    <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">{t("exercise.min")}</span>
                  </div>
                  <select className="input-base" value={exIntensity}
                    onChange={e => setExIntensity(e.target.value as Intensity)}>
                    {Object.entries(INTENSITY_LABELS_T).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                {previewKcal > 0 && (
                  <p className="text-xs text-center text-[var(--text-on-surface-muted)]">{t("exercise.estBurn")} <strong>{previewKcal} kcal</strong></p>
                )}
                {cardioErr && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" /> {cardioErr}
                  </p>
                )}
                <button onClick={saveExercise} className="btn-primary w-full py-2.5">{t("exercise.saveCardio")}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          STRENGTH SHEET
      ════════════════════════════════════════════ */}
      {showStrength && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center pb-16 md:pb-4">
          <div className="bg-[var(--surface)] w-full max-w-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--surface-border)] shrink-0">
              <h2 className="text-lg font-bold text-[var(--text-on-surface)]">{t("exercise.strModalTitle")}</h2>
              <button onClick={() => { setShowStrength(false); setStrExName(""); setStrSearch(""); setStrBodyPart(""); setStrExNameEn(""); setStrSets([{ weight: "", reps: "" }]); }}
                className="p-2 -mr-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* Body part selector */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-2">
                  {t("exercise.trainPart")}
                  {strBodyPartError && (
                    <span className="ml-2 text-red-500 font-normal normal-case">{t("exercise.partRequired")}</span>
                  )}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {BODY_PARTS.map(p => (
                    <button key={p} onClick={() => { setStrBodyPart(prev => prev === p ? "" : p); setStrBodyPartError(false); }}
                      className={clsx("px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                        strBodyPart === p ? "text-white" : strBodyPartError ? "bg-red-50 text-red-400 hover:bg-red-100" : "bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] hover:bg-[var(--surface-container)]")}
                      style={strBodyPart === p ? { backgroundColor: BODY_PART_COLORS[p] } : {}}>
                      {bpLabel(p)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exercise name */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-2">{t("exercise.exName")}</p>
                <input className="input-base" placeholder={t("exercise.exNamePH")}
                  value={strSearch || (lang === "en" ? (strengthExs.find(e => e.name === strExName)?.name_en ?? strExName) : strExName)}
                  onChange={e => { setStrSearch(e.target.value); setStrExName(e.target.value); }}
                  onFocus={() => setStrNameFocused(true)}
                  onBlur={() => setTimeout(() => setStrNameFocused(false), 150)} />

                {(strSearch || strNameFocused) && (
                  <div className="mt-1 border border-[var(--surface-border)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {filteredStrModal.slice(0, 30).map(e => (
                      <div key={e.exercise_id} className="flex items-center border-b border-[var(--surface-border)] last:border-0">
                        <button
                          onMouseDown={ev => ev.preventDefault()}
                          onClick={() => {
                            setStrExName(e.name);
                            if (e.body_part) setStrBodyPart(e.body_part as BodyPart);
                            setStrSearch("");
                            setStrNameFocused(false);
                            setStrExNameEn(""); // clear custom en name when picking from DB
                          }}
                          className="flex-1 flex items-center justify-between px-4 py-2.5 hover:bg-[var(--surface-container-low)] text-left">
                          <span className="text-sm font-medium text-[var(--text-on-surface)]">{(lang === "en" && e.name_en) ? e.name_en : e.name}</span>
                          {e.body_part && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ml-2 shrink-0"
                              style={{ backgroundColor: BODY_PART_COLORS[e.body_part] ?? "#9ca3af" }}>
                              {bpLabel(e.body_part)}
                            </span>
                          )}
                        </button>
                        {e.source_type === "user" && (
                          <button
                            onMouseDown={ev => ev.preventDefault()}
                            onClick={() => deleteExerciseFromDb(e)}
                            className="px-2 py-2.5 text-red-400 hover:text-red-500 transition-colors shrink-0">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    {filteredStrModal.length === 0 && strSearch && (
                      <div className="px-4 py-3 text-xs text-[var(--text-on-surface-muted)]">
                        {lang === "zh"
                          ? `直接使用「${strSearch}」作為動作名稱`
                          : `Use "${strSearch}" as exercise name`}
                      </div>
                    )}
                  </div>
                )}
                {/* English name field for new (custom) exercises */}
                {strExName.trim() && !exercises.some(e => e.name === strExName && e.category === "重訓") && (
                  <input className="input-base mt-2 text-sm"
                    placeholder={lang === "en" ? "English name (optional)" : "英文名稱（選填）"}
                    value={strExNameEn}
                    onChange={e => setStrExNameEn(e.target.value)} />
                )}
              </div>

              {/* Sets builder */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-3">{t("exercise.setsSetup")}</p>
                <div className="space-y-2">
                  {strSets.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--text-on-surface-muted)] w-12 shrink-0 text-center">
                        {lang === "zh" ? `第 ${idx + 1} 組` : `${t("exercise.setLabel")} ${idx + 1}`}
                      </span>
                      <div className="relative flex-1">
                        <input className="input-base py-2 pr-8 text-sm" type="number" inputMode="decimal" placeholder={t("exercise.weightKg")}
                          value={s.weight}
                          onChange={e => setStrSets(ss => ss.map((x, i) => i === idx ? { ...x, weight: e.target.value } : x))} />
                        <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">kg</span>
                      </div>
                      <span className="text-[var(--text-on-surface-muted)] text-sm">×</span>
                      <div className="relative flex-1">
                        <input className="input-base py-2 pr-8 text-sm" type="number" inputMode="decimal" placeholder={t("exercise.reps")}
                          value={s.reps}
                          onChange={e => setStrSets(ss => ss.map((x, i) => i === idx ? { ...x, reps: e.target.value } : x))} />
                        <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "下" : "reps"}</span>
                      </div>
                      {idx > 0 && (
                        <button onClick={() => setStrSets(ss => ss.filter((_, i) => i !== idx))}
                          className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={() => setStrSets(ss => [...ss, { weight: ss[ss.length - 1]?.weight ?? "", reps: "" }])}
                  className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] transition-colors">
                  <Plus size={13} /> {t("exercise.addSet")}
                </button>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[var(--surface-border)] shrink-0">
              {strFormErr && (
                <p className="text-xs text-red-500 flex items-center gap-1 mb-2">
                  <AlertCircle size={12} className="shrink-0" /> {strFormErr}
                </p>
              )}
              <button onClick={saveStrengthSession}
                disabled={!strExName.trim() || strSets.every(s => !s.weight || !s.reps)}
                className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-40">
                {lang === "zh"
                  ? `儲存（${strSets.filter(s => s.weight && s.reps).length} 組）`
                  : `Save (${strSets.filter(s => s.weight && s.reps).length} ${strSets.filter(s => s.weight && s.reps).length === 1 ? "set" : "sets"})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Running / Cardio form modal ── */}
      {showRunForm && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-4 pb-16 sm:pb-4">
          <div className="bg-[var(--surface)] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--surface-border)]">
              <h2 className="text-base font-bold text-[var(--text-on-surface)]">
                {addCardioType
                  ? `${CARDIO_EMOJI[addCardioType]} ${lang === "zh" ? CARDIO_LABEL[addCardioType].zh : CARDIO_LABEL[addCardioType].en} ${lang === "zh" ? "訓練" : "Session"}`
                  : t("exercise.addRun")}
              </h2>
              <button onClick={() => { setShowRunForm(false); setRunIntervals([{ distance: "", time: "" }]); setAddCardioType(""); }}
                className="p-2 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><X size={18} /></button>
            </div>

            {/* Cardio type selector */}
            <div className="px-4 pt-3 pb-1">
              {addCardioType ? (
                /* Locked — greyed out badge */
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-on-surface-muted)]">{lang === "zh" ? "運動類型" : "Activity type"}</span>
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] text-xs font-semibold opacity-60 cursor-not-allowed">
                    {CARDIO_EMOJI[addCardioType]} {lang === "zh" ? CARDIO_LABEL[addCardioType].zh : CARDIO_LABEL[addCardioType].en}
                  </span>
                  <span className="text-[10px] text-[var(--text-on-surface-muted)]">{lang === "zh" ? "（已鎖定）" : "(locked)"}</span>
                </div>
              ) : (
                /* Unlocked — segmented control */
                <div>
                  <p className="text-xs text-[var(--text-on-surface-muted)] mb-1.5">
                    {lang === "zh" ? "運動類型" : "Activity type"}
                    <span className="text-red-400 ml-1">*</span>
                  </p>
                  <div className="flex gap-1.5">
                    {(["running", "swimming", "cycling"] as CardioType[]).map(ct => (
                      <button
                        key={ct}
                        onClick={() => setAddCardioType(ct)}
                        className={clsx(
                          "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                          (addCardioType as string) === ct ? "bg-green-500 text-white" : "bg-[var(--surface-container)] text-[var(--text-on-surface-sub)] hover:bg-[var(--surface-container)]"
                        )}>
                        {CARDIO_EMOJI[ct]}
                        {lang === "zh" ? CARDIO_LABEL[ct].zh : CARDIO_LABEL[ct].en}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Intervals */}
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {runIntervals.map((iv, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--text-on-surface-muted)] w-5 shrink-0">{idx + 1}</span>
                  <div className="relative flex-1">
                    <input className="input-base py-2 pr-8 text-sm" type="number" inputMode="decimal" step="0.01"
                      placeholder={t("exercise.distance")} value={iv.distance}
                      onChange={e => setRunIntervals(xs => xs.map((x, i) => i === idx ? { ...x, distance: e.target.value } : x))} />
                    <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">km</span>
                  </div>
                  <span className="text-[var(--text-on-surface-muted)] text-xs">@</span>
                  <div className="relative flex-1">
                    <input className="input-base py-2 pr-10 text-sm" type="number" inputMode="decimal"
                      placeholder={t("exercise.duration")} value={iv.time}
                      onChange={e => setRunIntervals(xs => xs.map((x, i) => i === idx ? { ...x, time: e.target.value } : x))} />
                    <span className="absolute right-2 top-2 text-[10px] text-[var(--text-on-surface-muted)]">min</span>
                  </div>
                  {(addCardioType === "running" || addCardioType === "") && iv.distance && iv.time && (
                    <span className="text-xs text-green-500 font-medium w-16 shrink-0 text-right">
                      {formatPace(parseFloat(iv.distance) || 0, parseFloat(iv.time) || 0)}
                    </span>
                  )}
                  {idx > 0 && (
                    <button onClick={() => setRunIntervals(xs => xs.filter((_, i) => i !== idx))}
                      className="p-1 text-red-400 hover:text-red-500 shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setRunIntervals(xs => [...xs, { distance: "", time: "" }])}
                className="flex items-center gap-1 text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] py-1">
                <Plus size={12} /> {t("exercise.addIntervalBtn")}
              </button>
            </div>

            <div className="p-4 border-t border-[var(--surface-border)]">
              {runFormErr && (
                <p className="text-xs text-red-500 flex items-center gap-1 mb-2">
                  <AlertCircle size={12} className="shrink-0" /> {runFormErr}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowRunForm(false); setRunIntervals([{ distance: "", time: "" }]); setAddCardioType(""); setRunFormErr(null); }}
                  className="btn-ghost flex-1">{t("common.cancel")}</button>
                <button
                  onClick={saveRunningSession}
                  disabled={!addCardioType || runIntervals.filter(iv => iv.distance && iv.time).length === 0}
                  className="btn-primary flex-1 disabled:opacity-40">
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ExRow({ ex, onSelect, onFav, isFav, isSelected, onDelete }: {
  ex: ExerciseDB; onSelect: (e: ExerciseDB) => void;
  onFav: (e: ExerciseDB) => void; isFav: boolean; isSelected: boolean;
  onDelete?: (e: ExerciseDB) => void;
}) {
  const { lang } = useLangStore();
  const displayName = (lang === "en" && ex.name_en) ? ex.name_en : ex.name;
  return (
    <div className={clsx("flex items-center gap-2 px-2 py-2.5 rounded-xl cursor-pointer transition-all",
      isSelected ? "bg-[var(--surface-container)]" : "hover:bg-[var(--surface-container-low)]")}
      onClick={() => onSelect(ex)}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-on-surface)] truncate">{displayName}</p>
      </div>
      <button onClick={e => { e.stopPropagation(); onFav(ex); }}
        className={clsx("p-1.5 transition-colors", isFav ? "text-yellow-400" : "text-yellow-400 hover:text-yellow-500")}>
        <Star size={14} fill={isFav ? "currentColor" : "none"} />
      </button>
      {ex.source_type === "user" && onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(ex); }}
          className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
