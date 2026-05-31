import { useState, useEffect } from "react";
import { format, parseISO, addDays, subDays } from "date-fns";
import { fmtDay as fmtDayFn } from "@/lib/dateFormat";
import { Plus, X, Moon, Pencil, Check, ChevronLeft, ChevronRight, Trash2, History, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { showToast } from "@/store/toastStore";
import { addWeightEntry, deleteWeightEntry } from "@/lib/db/queries/log";
import { checkBound, BOUNDS } from "@/lib/validate";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { useSwipeTabs } from "@/hooks/useSwipe";
import { TimePicker } from "@/components/TimePicker";
import { BodyHistoryDrawer } from "@/components/body/BodyHistoryDrawer";
import { StickyHeader } from "@/components/layout/StickyHeader";
import { PillButton } from "@/components/common/PillButton";
import { Dialog } from "@/components/common/Modal";
import { BottomSheet } from "@/components/common/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────

type WeightType = "fasting" | "before_meal" | "after_meal";
interface WeightEntry {
  id: number; weight_kg: number; body_fat_pct: number | null;
  measurement_type: WeightType; log_date: string; log_time: string; notes: string | null;
}
const WEIGHT_TYPE_LABELS_ZH: Record<WeightType, string> = {
  fasting: "空腹", before_meal: "飯前", after_meal: "飯後",
};
const WEIGHT_TYPE_LABELS_EN: Record<WeightType, string> = {
  fasting: "Fasting", before_meal: "Pre-meal", after_meal: "Post-meal",
};

interface CompEntry {
  id: number;
  body_fat_pct: number | null;
  skeletal_muscle_kg: number | null;
  muscle_trunk_kg: number | null;
  muscle_left_arm_kg: number | null;
  muscle_right_arm_kg: number | null;
  muscle_left_leg_kg: number | null;
  muscle_right_leg_kg: number | null;
  body_water_pct: number | null;
  visceral_fat_level: number | null;
  waist_cm: number | null;
  log_date: string;
  log_time: string;
  notes: string | null;
}

type SleepQuality = "good" | "normal" | "poor";
interface SleepEntry {
  id: number; sleep_date: string; quality: SleepQuality;
  duration_hours: number | null; notes: string | null; log_time: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_FIELDS = [
  { key: "body_fat_pct",       unit: "%",  color: "#f97316", placeholder: "18.5" },
  { key: "body_water_pct",     unit: "%",  color: "#0ea5e9", placeholder: "55.0" },
  { key: "visceral_fat_level", unit: "",   color: "#8b5cf6", placeholder: "5"    },
  { key: "waist_cm",           unit: "cm", color: "#ec4899", placeholder: "75"   },
] as const;

const MUSCLE_FIELDS = [
  { key: "muscle_trunk_kg",     unit: "kg", color: "#10b981", placeholder: "24.0" },
  { key: "muscle_left_arm_kg",  unit: "kg", color: "#34d399", placeholder: "3.5"  },
  { key: "muscle_right_arm_kg", unit: "kg", color: "#34d399", placeholder: "3.5"  },
  { key: "muscle_left_leg_kg",  unit: "kg", color: "#6ee7b7", placeholder: "10.5" },
  { key: "muscle_right_leg_kg", unit: "kg", color: "#6ee7b7", placeholder: "10.5" },
] as const;

type BaseKey   = typeof BASE_FIELDS[number]["key"];
type MuscleKey = typeof MUSCLE_FIELDS[number]["key"];
type FormKey   = BaseKey | MuscleKey;

const SLEEP_COLORS: Record<SleepQuality, string> = {
  good: "#10b981", normal: "#f59e0b", poor: "#ef4444",
};

const fmt = (d: string) => format(parseISO(d), "yyyy/M/d");

const initForm = (): Record<FormKey, string> => ({
  body_fat_pct: "", body_water_pct: "", visceral_fat_level: "", waist_cm: "",
  muscle_trunk_kg: "", muscle_left_arm_kg: "", muscle_right_arm_kg: "",
  muscle_left_leg_kg: "", muscle_right_leg_kg: "",
});

const entryToForm = (e: CompEntry): Record<FormKey, string> => ({
  body_fat_pct:       e.body_fat_pct       != null ? String(e.body_fat_pct)       : "",
  body_water_pct:     e.body_water_pct     != null ? String(e.body_water_pct)     : "",
  visceral_fat_level: e.visceral_fat_level != null ? String(e.visceral_fat_level) : "",
  waist_cm:           e.waist_cm           != null ? String(e.waist_cm)           : "",
  muscle_trunk_kg:    e.muscle_trunk_kg    != null ? String(e.muscle_trunk_kg)    : "",
  muscle_left_arm_kg: e.muscle_left_arm_kg != null ? String(e.muscle_left_arm_kg) : "",
  muscle_right_arm_kg:e.muscle_right_arm_kg!= null ? String(e.muscle_right_arm_kg): "",
  muscle_left_leg_kg: e.muscle_left_leg_kg != null ? String(e.muscle_left_leg_kg) : "",
  muscle_right_leg_kg:e.muscle_right_leg_kg!= null ? String(e.muscle_right_leg_kg): "",
});

// ─── Component ────────────────────────────────────────────────────────────────

export function BodyStatus() {
  const { profile } = useUserStore();
  const { t, lang } = useLangStore();
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;
  const fmtDay = (d: string) => fmtDayFn(d, lang);

  // ── Locale-aware labels ────────────────────────────────────────────────────

  const BASE_LABELS: Record<BaseKey, string> = {
    body_fat_pct:       t("body.bodyFat"),
    body_water_pct:     t("body.water"),
    visceral_fat_level: t("body.visceralFat"),
    waist_cm:           t("body.waist"),
  };

  const BASE_UNITS: Record<BaseKey, string> = {
    body_fat_pct:       "%",
    body_water_pct:     "%",
    visceral_fat_level: t("body.visceralUnit"),
    waist_cm:           "cm",
  };

  const MUSCLE_LABELS: Record<MuscleKey, string> = {
    muscle_trunk_kg:     t("body.muscleParts.trunk"),
    muscle_left_arm_kg:  t("body.muscleParts.leftArm"),
    muscle_right_arm_kg: t("body.muscleParts.rightArm"),
    muscle_left_leg_kg:  t("body.muscleParts.leftLeg"),
    muscle_right_leg_kg: t("body.muscleParts.rightLeg"),
  };

  const SLEEP_LABELS: Record<SleepQuality, string> = {
    good:   t("body.sleep.good"),
    normal: t("body.sleep.normal"),
    poor:   t("body.sleep.poor"),
  };

  // ── State ─────────────────────────────────────────────────────────────────

  const [mainTab, setMainTab] = useState<"weight" | "body" | "sleep">("weight");
  const BODY_TABS = ["weight", "body", "sleep"] as const;
  const bodySwipe = useSwipeTabs(BODY_TABS, mainTab, setMainTab as (t: string) => void);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [entries, setEntries] = useState<CompEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState<Record<FormKey, string>>(initForm);
  const [formNotes, setFormNotes] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [formTime, setFormTime] = useState(format(new Date(), "HH:mm"));
  // Inline edit for body comp
  const [editId, setEditId]     = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<FormKey, string>>(initForm);
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState(today);
  const [editTime, setEditTime] = useState(format(new Date(), "HH:mm"));

  // Weight
  const [weightEntries, setWeightEntries]   = useState<WeightEntry[]>([]);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightVal, setWeightVal]           = useState("");
  const [bodyFatVal, setBodyFatVal]         = useState("");
  const [weightType, setWeightType]         = useState<WeightType>("fasting");
  const [weightNotes, setWeightNotes]       = useState("");
  const [editingWeight, setEditingWeight]   = useState<{ id: number; weight: string; bodyFat: string; type: WeightType } | null>(null);

  // Form validation errors
  const [weightFormErr, setWeightFormErr] = useState<string | null>(null);
  const [compFormErr,   setCompFormErr]   = useState<string | null>(null);
  const [sleepFormErr,  setSleepFormErr]  = useState<string | null>(null);

  // Sleep
  const [sleepEntries, setSleepEntries]   = useState<SleepEntry[]>([]);
  const [showSleepForm, setShowSleepForm] = useState(false);
  const [sleepDate, setSleepDate]         = useState(today);
  const [sleepQuality, setSleepQuality]   = useState<SleepQuality>("normal");
  const [sleepHours, setSleepHours]       = useState("");
  const [sleepNotes, setSleepNotes]       = useState("");
  const [editingSleep, setEditingSleep]   = useState<{ id: number; quality: SleepQuality; hours: string } | null>(null);

  useEffect(() => {
    if (profile) { loadEntries(); loadSleep(); loadWeightEntries(); }
  }, [profile, selectedDate]);

  // ── Body composition loaders ───────────────────────────────────────────────

  const loadEntries = async () => {
    try {
      const db   = await getDb();
      const rows = await db.select<CompEntry[]>(
        `SELECT * FROM body_composition_log
         WHERE user_id=? AND log_date=?
         ORDER BY log_time DESC`,
        [profile!.user_id, selectedDate]);
      setEntries(rows);
    } catch (e) { logError("BodyStatus", e); }
  };

  const save = async () => {
    if (!profile) return;
    const allKeys: FormKey[] = [...BASE_FIELDS.map(f => f.key), ...MUSCLE_FIELDS.map(f => f.key)];
    const hasAny = allKeys.some(k => form[k].trim() !== "");
    if (!hasAny) return;
    setCompFormErr(null);
    const compErr =
      checkBound(form.body_fat_pct,        BOUNDS.bodyFat,     lang) ??
      checkBound(form.body_water_pct,      BOUNDS.bodyWater,   lang) ??
      checkBound(form.visceral_fat_level,  BOUNDS.visceralFat, lang) ??
      checkBound(form.waist_cm,            BOUNDS.waist,       lang) ??
      checkBound(form.muscle_trunk_kg,     BOUNDS.muscleTrunk, lang) ??
      checkBound(form.muscle_left_arm_kg,  BOUNDS.muscleArm,   lang) ??
      checkBound(form.muscle_right_arm_kg, BOUNDS.muscleArm,   lang) ??
      checkBound(form.muscle_left_leg_kg,  BOUNDS.muscleLeg,   lang) ??
      checkBound(form.muscle_right_leg_kg, BOUNDS.muscleLeg,   lang);
    if (compErr) { setCompFormErr(compErr); return; }
    try {
      const db = await getDb();
      const muscleParts = MUSCLE_FIELDS.map(f => form[f.key]).filter(v => v.trim() !== "").map(parseFloat);
      const totalMuscle = muscleParts.length > 0 ? muscleParts.reduce((s, v) => s + v, 0) : null;
      await db.execute(
        `INSERT INTO body_composition_log
           (user_id, body_fat_pct, skeletal_muscle_kg,
            muscle_trunk_kg, muscle_left_arm_kg, muscle_right_arm_kg, muscle_left_leg_kg, muscle_right_leg_kg,
            body_water_pct, visceral_fat_level, waist_cm, log_date, log_time, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          profile.user_id,
          form.body_fat_pct        ? parseFloat(form.body_fat_pct)        : null,
          totalMuscle,
          form.muscle_trunk_kg     ? parseFloat(form.muscle_trunk_kg)     : null,
          form.muscle_left_arm_kg  ? parseFloat(form.muscle_left_arm_kg)  : null,
          form.muscle_right_arm_kg ? parseFloat(form.muscle_right_arm_kg) : null,
          form.muscle_left_leg_kg  ? parseFloat(form.muscle_left_leg_kg)  : null,
          form.muscle_right_leg_kg ? parseFloat(form.muscle_right_leg_kg) : null,
          form.body_water_pct      ? parseFloat(form.body_water_pct)      : null,
          form.visceral_fat_level  ? parseInt(form.visceral_fat_level)    : null,
          form.waist_cm            ? parseFloat(form.waist_cm)            : null,
          formDate,
          formTime + ":00",
          formNotes.trim() || null,
        ]);
      setShowForm(false); setForm(initForm()); setFormNotes("");
      setFormDate(today); setFormTime(format(new Date(), "HH:mm"));
      loadEntries();
    } catch (e) { logError("BodyStatus", e); }
  };

  const startEdit = (e: CompEntry) => {
    setEditId(e.id);
    setEditForm(entryToForm(e));
    setEditNotes(e.notes ?? "");
    setEditDate(e.log_date);
    setEditTime(e.log_time?.slice(0, 5) ?? format(new Date(), "HH:mm"));
  };

  const saveEdit = async () => {
    if (!profile || editId == null) return;
    try {
      const db = await getDb();
      const f = editForm;
      const muscleParts = MUSCLE_FIELDS.map(mf => f[mf.key]).filter(v => v.trim() !== "").map(parseFloat);
      const totalMuscle = muscleParts.length > 0 ? muscleParts.reduce((s, v) => s + v, 0) : null;
      await db.execute(
        `UPDATE body_composition_log SET
           body_fat_pct=?, skeletal_muscle_kg=?,
           muscle_trunk_kg=?, muscle_left_arm_kg=?, muscle_right_arm_kg=?,
           muscle_left_leg_kg=?, muscle_right_leg_kg=?,
           body_water_pct=?, visceral_fat_level=?, waist_cm=?,
           log_date=?, log_time=?, notes=?
         WHERE id=?`,
        [
          f.body_fat_pct        ? parseFloat(f.body_fat_pct)        : null,
          totalMuscle,
          f.muscle_trunk_kg     ? parseFloat(f.muscle_trunk_kg)     : null,
          f.muscle_left_arm_kg  ? parseFloat(f.muscle_left_arm_kg)  : null,
          f.muscle_right_arm_kg ? parseFloat(f.muscle_right_arm_kg) : null,
          f.muscle_left_leg_kg  ? parseFloat(f.muscle_left_leg_kg)  : null,
          f.muscle_right_leg_kg ? parseFloat(f.muscle_right_leg_kg) : null,
          f.body_water_pct      ? parseFloat(f.body_water_pct)      : null,
          f.visceral_fat_level  ? parseInt(f.visceral_fat_level)    : null,
          f.waist_cm            ? parseFloat(f.waist_cm)            : null,
          editDate,
          editTime + ":00",
          editNotes.trim() || null,
          editId,
        ]);
      setEditId(null); setEditForm(initForm()); setEditNotes("");
      setEditDate(today); setEditTime(format(new Date(), "HH:mm"));
      loadEntries();
    } catch (e) { logError("BodyStatus", e); }
  };

  const deleteEntry = async (id: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM body_composition_log WHERE id=?", [id]);
      loadEntries();
    } catch (e) { logError("BodyStatus", e); }
  };

  // ── Sleep loaders & actions ────────────────────────────────────────────────

  const loadSleep = async () => {
    if (!profile) return;
    try {
      const db   = await getDb();
      const rows = await db.select<SleepEntry[]>(
        `SELECT * FROM sleep_log WHERE user_id=? AND sleep_date=?
         ORDER BY log_time DESC`,
        [profile.user_id, selectedDate]);
      setSleepEntries(rows);
    } catch (e) { logError("BodyStatus", e); }
  };

  const loadWeightEntries = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<WeightEntry[]>(
        "SELECT * FROM weight_log WHERE user_id=? AND log_date=? ORDER BY log_time DESC",
        [profile!.user_id, selectedDate]);
      setWeightEntries(rows);
    } catch (e) { logError("BodyStatus", e); }
  };

  const saveWeight = async () => {
    if (!weightVal || !profile) return;
    setWeightFormErr(null);
    const errW  = checkBound(weightVal,  BOUNDS.weight,  lang, true);
    const errBf = bodyFatVal ? checkBound(bodyFatVal, BOUNDS.bodyFat, lang) : null;
    if (errW || errBf) { setWeightFormErr(errW ?? errBf); return; }
    try {
      await addWeightEntry(
        profile.user_id, parseFloat(weightVal),
        bodyFatVal ? parseFloat(bodyFatVal) : null,
        weightType, selectedDate, weightNotes || null);
      setShowWeightForm(false); setWeightVal(""); setBodyFatVal(""); setWeightNotes("");
      loadWeightEntries();
    } catch (e) {
      logError("BodyStatus.saveWeight", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  const saveEditWeight = async () => {
    if (!editingWeight) return;
    const w = parseFloat(editingWeight.weight);
    if (!w) return;
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE weight_log SET weight_kg=?, body_fat_pct=?, measurement_type=? WHERE id=?",
        [w, editingWeight.bodyFat ? parseFloat(editingWeight.bodyFat) : null,
         editingWeight.type, editingWeight.id]);
      setEditingWeight(null);
      loadWeightEntries();
    } catch (e) { logError("BodyStatus", e); }
  };

  const saveSleep = async () => {
    if (!profile) return;
    setSleepFormErr(null);
    if (sleepHours.trim()) {
      const err = checkBound(sleepHours, BOUNDS.sleepHours, lang);
      if (err) { setSleepFormErr(err); return; }
    }
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO sleep_log (user_id, sleep_date, quality, duration_hours, notes) VALUES (?,?,?,?,?)",
        [profile.user_id, sleepDate, sleepQuality,
         sleepHours ? parseFloat(sleepHours) : null,
         sleepNotes.trim() || null]);
      setShowSleepForm(false); setSleepDate(today); setSleepQuality("normal");
      setSleepHours(""); setSleepNotes("");
      loadSleep();
    } catch (e) {
      logError("BodyStatus.saveSleep", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  const saveEditSleep = async () => {
    if (!editingSleep) return;
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE sleep_log SET quality=?, duration_hours=? WHERE id=?",
        [editingSleep.quality,
         editingSleep.hours ? parseFloat(editingSleep.hours) : null,
         editingSleep.id]);
      setEditingSleep(null); loadSleep();
    } catch (e) { logError("BodyStatus", e); }
  };

  const deleteSleep = async (id: number) => {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM sleep_log WHERE id=?", [id]);
      loadSleep();
    } catch (e) { logError("BodyStatus", e); }
  };

  const getMuscleSummary = (e: CompEntry): string | null => {
    const parts = [
      e.muscle_trunk_kg     != null ? `${t("body.muscleParts.trunk")} ${e.muscle_trunk_kg}` : null,
      e.muscle_left_arm_kg  != null ? `${t("body.muscleParts.leftArm")} ${e.muscle_left_arm_kg}` : null,
      e.muscle_right_arm_kg != null ? `${t("body.muscleParts.rightArm")} ${e.muscle_right_arm_kg}` : null,
      e.muscle_left_leg_kg  != null ? `${t("body.muscleParts.leftLeg")} ${e.muscle_left_leg_kg}` : null,
      e.muscle_right_leg_kg != null ? `${t("body.muscleParts.rightLeg")} ${e.muscle_right_leg_kg}` : null,
    ].filter(Boolean);
    return parts.length > 0
      ? parts.join(" · ")
      : (e.skeletal_muscle_kg != null ? `${t("body.muscleMass")} ${e.skeletal_muscle_kg}` : null);
  };

  const latest = entries[0] ?? null;

  if (!profile) return (
    <div className="flex items-center justify-center h-full text-[var(--text-on-bg-muted)] text-sm">
      {t("common.noProfile")}
    </div>
  );

  return (
    <div className="page-body max-w-2xl mx-auto pb-24" {...bodySwipe}>
      {/* Sticky header */}
      <StickyHeader row>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-on-bg)]">{t("body.pageTitle")}</h1>
          <p className="text-[var(--text-on-bg-muted)] font-bold text-sm mt-0.5">{t("body.subtitle")}</p>
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          className="p-2 text-[var(--text-on-bg)] hover:text-[var(--text-on-bg-muted)] transition-colors mt-0.5"
        >
          <History size={20} />
        </button>
      </StickyHeader>

      <BodyHistoryDrawer
        open={historyOpen}
        tab={mainTab}
        userId={profile.user_id}
        onClose={() => setHistoryOpen(false)}
        onSelectDate={date => { setSelectedDate(date); setHistoryOpen(false); }}
      />

      {/* Main tab */}
      <div className="pill-bar mb-3">
        {([
          { key: "weight", label: t("body.tab.weight") },
          { key: "body",   label: t("body.tab.body") },
          { key: "sleep",  label: t("body.tab.sleep") },
        ] as { key: "weight" | "body" | "sleep"; label: string }[]).map(({ key, label }) => (
          <PillButton key={key} onClick={() => setMainTab(key)} isActive={mainTab === key}
            className="flex-1 py-2 text-sm">
            {label}
          </PillButton>
        ))}
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between mb-4 bg-white/10 rounded-xl px-1 py-1">
        <button
          onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)] transition-colors active:bg-white/20 rounded-xl">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-[var(--text-on-bg)]">
          {isToday
            ? `${t("common.today")} · ${format(parseISO(selectedDate), "M/d")}`
            : fmtDay(selectedDate)}
        </span>
        <button
          onClick={() => {
            const next = format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd");
            if (next <= today) setSelectedDate(next);
          }}
          className={clsx(
            "min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors rounded-xl",
            selectedDate >= today
              ? "text-[var(--text-on-bg-faint)] cursor-not-allowed"
              : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)] active:bg-white/20"
          )}
          disabled={selectedDate >= today}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── WEIGHT TAB ── */}
      {mainTab === "weight" && (
        <div className="space-y-4">
          {weightEntries.length === 0 ? (
            <div className="card text-center py-10 text-[var(--text-on-surface-muted)] space-y-2">
              <p className="text-2xl">⚖️</p>
              <p className="text-sm">{t("body.weight.noRecord")}</p>
            </div>
          ) : weightEntries.map(w => (
            <div key={w.id} className="card border-l-4 border-l-teal-300">
              {editingWeight?.id === w.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input className="input-base text-lg font-bold pr-10 py-2" type="number" inputMode="decimal" placeholder="kg"
                        value={editingWeight.weight}
                        onChange={ev => setEditingWeight(x => x ? { ...x, weight: ev.target.value } : null)} />
                      <span className="absolute right-3 top-2.5 text-sm text-[var(--text-on-surface-muted)]">kg</span>
                    </div>
                    <div className="relative flex-1">
                      <input className="input-base pr-7 py-2" type="number" inputMode="decimal" placeholder={lang === "zh" ? "體脂（選填）" : "Body fat (opt)"}
                        value={editingWeight.bodyFat}
                        onChange={ev => setEditingWeight(x => x ? { ...x, bodyFat: ev.target.value } : null)} />
                      <span className="absolute right-2 top-2.5 text-xs text-[var(--text-on-surface-muted)]">%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select className="input-base flex-1 py-1.5 text-sm"
                      value={editingWeight.type}
                      onChange={ev => setEditingWeight(x => x ? { ...x, type: ev.target.value as WeightType } : null)}>
                      {(Object.keys(WEIGHT_TYPE_LABELS_ZH) as WeightType[]).map(wt => (
                        <option key={wt} value={wt}>
                          {lang === "zh" ? WEIGHT_TYPE_LABELS_ZH[wt] : WEIGHT_TYPE_LABELS_EN[wt]}
                        </option>
                      ))}
                    </select>
                    <button onClick={saveEditWeight}
                      className="px-4 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium flex items-center gap-1">
                      <Check size={14} /> {t("common.save")}
                    </button>
                    <button onClick={() => setEditingWeight(null)}
                      className="px-3 py-1.5 rounded-xl border border-[var(--surface-border)] text-[var(--text-on-surface-muted)] text-sm">
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-[var(--text-on-surface)]">{w.weight_kg}</span>
                      <span className="text-sm text-[var(--text-on-surface-muted)]">kg</span>
                      {w.body_fat_pct != null && (
                        <span className="text-sm text-[var(--text-on-surface-muted)]">· 體脂 {w.body_fat_pct}%</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="badge bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] text-xs">
                        {lang === "zh" ? WEIGHT_TYPE_LABELS_ZH[w.measurement_type] : WEIGHT_TYPE_LABELS_EN[w.measurement_type]}
                      </span>
                      <span className="text-xs text-[var(--text-on-surface-muted)]">{w.log_date} {w.log_time?.slice(0, 5)}</span>
                    </div>
                    {w.notes && <p className="text-xs text-[var(--text-on-surface-muted)] mt-1">{w.notes}</p>}
                  </div>
                  <button onClick={() => setEditingWeight({ id: w.id, weight: String(w.weight_kg), bodyFat: w.body_fat_pct != null ? String(w.body_fat_pct) : "", type: w.measurement_type })}
                    className="p-1.5 text-yellow-400 hover:text-yellow-500 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={async () => { await deleteWeightEntry(w.id); loadWeightEntries(); }}
                    className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {showWeightForm ? (
            <div className="card space-y-3 border border-teal-200">
              <p className="text-sm font-semibold text-[var(--text-on-surface)]">{t("body.weight.add")}</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input autoFocus className="input-base text-lg font-bold pr-10 py-2" type="number" inputMode="decimal" placeholder="kg"
                    value={weightVal} onChange={e => setWeightVal(e.target.value)} />
                  <span className="absolute right-3 top-2.5 text-sm text-[var(--text-on-surface-muted)]">kg</span>
                </div>
                <div className="relative flex-1">
                  <input className="input-base pr-7 py-2" type="number" inputMode="decimal" placeholder={lang === "zh" ? "體脂（選填）" : "Body fat (opt)"}
                    value={bodyFatVal} onChange={e => setBodyFatVal(e.target.value)} />
                  <span className="absolute right-2 top-2.5 text-xs text-[var(--text-on-surface-muted)]">%</span>
                </div>
              </div>
              <select className="input-base text-sm"
                value={weightType} onChange={e => setWeightType(e.target.value as WeightType)}>
                {(Object.keys(WEIGHT_TYPE_LABELS_ZH) as WeightType[]).map(wt => (
                  <option key={wt} value={wt}>
                    {lang === "zh" ? WEIGHT_TYPE_LABELS_ZH[wt] : WEIGHT_TYPE_LABELS_EN[wt]}
                  </option>
                ))}
              </select>
              <input className="input-base text-sm" placeholder={lang === "zh" ? "備註（選填）" : "Notes (optional)"}
                value={weightNotes} onChange={e => setWeightNotes(e.target.value)} />
              {weightFormErr && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" /> {weightFormErr}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowWeightForm(false); setWeightVal(""); setBodyFatVal(""); setWeightNotes(""); setWeightFormErr(null); }}
                  className="btn-ghost flex-1">{t("common.cancel")}</button>
                <button onClick={saveWeight} disabled={!weightVal}
                  className="btn-primary flex-1 disabled:opacity-40">{t("common.save")}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowWeightForm(true)}
              className="w-full py-3 rounded-xl bg-[var(--surface)] text-[var(--text-on-surface)] border border-[var(--surface-border)] hover:bg-[var(--surface-container-low)] transition-all flex items-center justify-center gap-2 text-sm">
              <Plus size={16} /> {t("body.weight.add")}
            </button>
          )}
        </div>
      )}

      {/* ── Body Composition Tab ── */}
      {mainTab === "body" && (
        <>
          {/* Latest summary cards */}
          {latest && (
            <div className="space-y-3 mb-5">
              <p className="text-xs text-[var(--text-on-bg-muted)]">
                {t("body.latestRecord")} · {fmt(latest.log_date)}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {BASE_FIELDS.map(f => {
                  const val = latest[f.key as keyof CompEntry] as number | null;
                  if (val == null) return null;
                  return (
                    <div key={f.key} className="card p-3">
                      <p className="text-[10px] text-[var(--text-on-surface-muted)] mb-1">{BASE_LABELS[f.key]}</p>
                      <p className="text-lg font-bold" style={{ color: f.color }}>
                        {val}
                        <span className="text-[10px] font-normal text-[var(--text-on-surface-muted)] ml-0.5">{BASE_UNITS[f.key]}</span>
                      </p>
                    </div>
                  );
                }).filter(Boolean)}
              </div>

              {/* Muscle breakdown */}
              {(latest.muscle_trunk_kg != null || latest.skeletal_muscle_kg != null) && (
                <div className="card">
                  <p className="text-xs text-[var(--text-on-surface-muted)] mb-2">{t("body.muscleDist")}</p>
                  {latest.muscle_trunk_kg != null ? (
                    <div className="grid grid-cols-5 gap-2 text-center">
                      {MUSCLE_FIELDS.map(f => {
                        const val = latest[f.key as keyof CompEntry] as number | null;
                        return (
                          <div key={f.key}>
                            <p className="text-[10px] text-[var(--text-on-surface-muted)] mb-0.5">{MUSCLE_LABELS[f.key]}</p>
                            <p className="text-sm font-bold" style={{ color: f.color }}>
                              {val != null ? val : "—"}
                            </p>
                            {val != null && <p className="text-[10px] text-[var(--text-on-surface-muted)]">kg</p>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-lg font-bold text-emerald-500">
                      {latest.skeletal_muscle_kg} <span className="text-sm font-normal text-[var(--text-on-surface-muted)]">kg</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Record list */}
          <div className="space-y-2 mb-4">
            {entries.length === 0 ? (
              <div className="card text-center py-6 text-[var(--text-on-surface-muted)]">
                <p>{t("body.noRecord")}</p>
              </div>
            ) : entries.map(e => (
              <div key={e.id} className="card border-l-4 border-l-teal-300">
                {editId === e.id ? (
                  /* ── Inline edit ── */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input className="input-base py-1 text-sm w-32 shrink-0" type="date"
                          value={editDate} max={today}
                          onChange={ev => setEditDate(ev.target.value)} />
                        <TimePicker value={editTime} onChange={setEditTime} />
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={saveEdit} className="p-1.5 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditId(null)} className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {BASE_FIELDS.map(f => (
                        <div key={f.key}>
                          <label className="block text-[10px] font-medium mb-0.5" style={{ color: f.color }}>{BASE_LABELS[f.key]}</label>
                          <div className="relative">
                            <input className="input-base py-1.5 pr-8 text-sm" type="number" inputMode="decimal" placeholder={f.placeholder}
                              value={editForm[f.key as FormKey]}
                              onChange={ev => setEditForm(prev => ({ ...prev, [f.key]: ev.target.value }))} />
                            <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">{BASE_UNITS[f.key]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {MUSCLE_FIELDS.map(f => (
                        <div key={f.key}>
                          <label className="block text-[9px] font-medium text-center mb-0.5" style={{ color: f.color }}>{MUSCLE_LABELS[f.key]}</label>
                          <input className="input-base text-center text-xs px-1 py-1.5" type="number" inputMode="decimal" placeholder={f.placeholder}
                            value={editForm[f.key as FormKey]}
                            onChange={ev => setEditForm(prev => ({ ...prev, [f.key]: ev.target.value }))} />
                        </div>
                      ))}
                    </div>
                    <input className="input-base text-sm py-1.5" placeholder={`${t("body.sleep.notes")}（${t("common.optional")}）`}
                      value={editNotes} onChange={ev => setEditNotes(ev.target.value)} />
                  </div>
                ) : (
                  /* ── Normal display ── */
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-sm font-semibold text-[var(--text-on-surface)]">{fmt(e.log_date)}</p>
                        <span className="text-xs text-[var(--text-on-surface-muted)]">{e.log_time?.slice(0, 5)}</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {e.body_fat_pct   != null && <span className="text-xs"><span className="text-[var(--text-on-surface-muted)]">{t("body.bfShort")} </span><span className="font-semibold" style={{ color: "#f97316" }}>{e.body_fat_pct}%</span></span>}
                        {e.body_water_pct != null && <span className="text-xs"><span className="text-[var(--text-on-surface-muted)]">{t("body.waterShort")} </span><span className="font-semibold" style={{ color: "#0ea5e9" }}>{e.body_water_pct}%</span></span>}
                        {e.visceral_fat_level != null && <span className="text-xs"><span className="text-[var(--text-on-surface-muted)]">{t("body.visceralShort")} </span><span className="font-semibold" style={{ color: "#8b5cf6" }}>Lv.{e.visceral_fat_level}</span></span>}
                        {e.waist_cm != null && <span className="text-xs"><span className="text-[var(--text-on-surface-muted)]">{t("body.waist")} </span><span className="font-semibold" style={{ color: "#ec4899" }}>{e.waist_cm}cm</span></span>}
                      </div>
                      {getMuscleSummary(e) && <p className="text-xs text-emerald-600 mt-1 font-medium">{t("body.muscleShort")} {getMuscleSummary(e)} kg</p>}
                      {e.notes && <p className="text-xs text-[var(--text-on-surface-muted)] mt-1">{e.notes}</p>}
                    </div>
                    <button onClick={() => startEdit(e)} className="p-1.5 text-yellow-400 hover:text-yellow-500 transition-colors mt-0.5">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteEntry(e.id)} className="p-1.5 text-red-400 hover:text-red-500 transition-colors mt-0.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={() => { setFormDate(selectedDate); setShowForm(true); }}
            className="w-full py-3.5 rounded-xl bg-[var(--surface)] text-[var(--text-on-surface)] border border-[var(--surface-border)] hover:bg-[var(--surface-container-low)] transition-all flex items-center justify-center gap-2 text-sm font-medium">
            <Plus size={16} /> {t("body.addMeasurement")}
          </button>
        </>
      )}

      {/* ── Sleep Tab ── */}
      {mainTab === "sleep" && (
        <>
          {/* Sleep list */}
          <div className="space-y-2 mb-4">
            {sleepEntries.length === 0 ? (
              <div className="card text-center py-10 text-[var(--text-on-surface-muted)]">
                <Moon size={32} className="mx-auto mb-2 text-[var(--text-on-surface-muted)]" />
                <p className="text-sm">{t("body.noSleepRecord")}</p>
              </div>
            ) : sleepEntries.map(e => (
              <div key={e.id} className="card">
                {editingSleep?.id === e.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 flex-1">
                      {(["good", "normal", "poor"] as SleepQuality[]).map(q => (
                        <button key={q} onClick={() => setEditingSleep(s => s ? { ...s, quality: q } : null)}
                          className={clsx("flex-1 py-1.5 rounded-xl text-xs font-medium transition-all",
                            editingSleep.quality === q ? "text-white" : "bg-[var(--surface-container)] text-[var(--text-on-surface-muted)]")}
                          style={editingSleep.quality === q ? { backgroundColor: SLEEP_COLORS[q] } : {}}>
                          {SLEEP_LABELS[q]}
                        </button>
                      ))}
                    </div>
                    <div className="relative w-20">
                      <input className="input-base py-1.5 pr-7 text-sm" type="number" inputMode="decimal" step="0.5" placeholder={t("body.sleep.hours")}
                        value={editingSleep.hours}
                        onChange={ev => setEditingSleep(s => s ? { ...s, hours: ev.target.value } : null)} />
                      <span className="absolute right-2 top-1.5 text-[10px] text-[var(--text-on-surface-muted)]">h</span>
                    </div>
                    <button onClick={saveEditSleep} className="p-1.5 text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]"><Check size={14} /></button>
                    <button onClick={() => setEditingSleep(null)} className="p-1.5 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SLEEP_COLORS[e.quality] }} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-on-surface)]">{fmt(e.sleep_date)}</span>
                        <span className="text-xs font-medium" style={{ color: SLEEP_COLORS[e.quality] }}>{SLEEP_LABELS[e.quality]}</span>
                        {e.duration_hours != null && (
                          <span className="text-xs text-[var(--text-on-surface-muted)]">{e.duration_hours}h</span>
                        )}
                      </div>
                      {e.notes && <p className="text-xs text-[var(--text-on-surface-muted)] mt-0.5">{e.notes}</p>}
                    </div>
                    <button onClick={() => setEditingSleep({ id: e.id, quality: e.quality, hours: e.duration_hours ? String(e.duration_hours) : "" })}
                      className="p-1.5 text-yellow-400 hover:text-yellow-500 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteSleep(e.id)} className="p-1.5 text-red-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={() => { setSleepDate(selectedDate); setShowSleepForm(true); }}
            className="w-full py-3.5 rounded-xl bg-[var(--surface)] text-[var(--text-on-surface)] border border-[var(--surface-border)] hover:bg-[var(--surface-container-low)] transition-all flex items-center justify-center gap-2 text-sm font-medium">
            <Plus size={16} /> {t("body.addSleepEntry")}
          </button>
        </>
      )}

      {/* ── Body form modal ── */}
      {showForm && (
        <BottomSheet>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--surface-border)] shrink-0">
              <h2 className="text-lg font-bold text-[var(--text-on-surface)]">{t("body.bodyFormTitle")}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 -mr-1 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              {/* Date + Time */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("body.recordDate")}</label>
                  <input className="input-base" type="date" value={formDate} max={today}
                    onChange={e => setFormDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("body.recordTime")}</label>
                  <TimePicker value={formTime} onChange={setFormTime} />
                </div>
              </div>
              <p className="text-xs text-[var(--text-on-surface-muted)]">{t("body.formHint")}</p>
              <div className="grid grid-cols-2 gap-3">
                {BASE_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium mb-1" style={{ color: f.color }}>{BASE_LABELS[f.key]}</label>
                    <div className="relative">
                      <input className="input-base pr-10" type="number" inputMode="decimal" placeholder={f.placeholder}
                        value={form[f.key as FormKey]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                      <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">{BASE_UNITS[f.key]}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--text-on-surface-muted)] mb-2">{t("body.muscleDist")} (kg)</p>
                <div className="grid grid-cols-5 gap-2">
                  {MUSCLE_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-center mb-1" style={{ color: f.color }}>{MUSCLE_LABELS[f.key]}</label>
                      <input className="input-base text-center text-sm px-1" type="number" inputMode="decimal" placeholder={f.placeholder}
                        value={form[f.key as FormKey]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                {MUSCLE_FIELDS.some(f => form[f.key as FormKey] !== "") && (
                  <p className="text-xs text-[var(--text-on-surface-muted)] mt-1.5 text-right">
                    {t("body.muscleTotalLabel")} {MUSCLE_FIELDS.filter(f => form[f.key as FormKey] !== "").reduce((s, f) => s + parseFloat(form[f.key as FormKey] || "0"), 0).toFixed(1)} kg
                  </p>
                )}
              </div>
              <input className="input-base" placeholder={`${t("body.sleep.notes")}（${t("common.optional")}）`}
                value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>
            <div className="px-5 py-4 border-t border-[var(--surface-border)] shrink-0">
              {compFormErr && (
                <p className="text-xs text-red-500 flex items-center gap-1 mb-2">
                  <AlertCircle size={12} className="shrink-0" /> {compFormErr}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setCompFormErr(null); }} className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
                <button onClick={save} className="btn-primary bg-[var(--color-primary)] flex-1">{t("common.save")}</button>
              </div>
            </div>
        </BottomSheet>
      )}

      {/* ── Sleep form modal ── */}
      {showSleepForm && (
        <Dialog>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("body.sleepModalTitle")}</h3>
              <button onClick={() => setShowSleepForm(false)} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><X size={20} /></button>
            </div>

            <div>
              <p className="text-xs text-[var(--text-on-surface-muted)] mb-1.5">{t("body.sleepDate")}</p>
              <input className="input-base" type="date" value={sleepDate}
                onChange={e => setSleepDate(e.target.value)} max={today} />
            </div>

            <div>
              <p className="text-xs text-[var(--text-on-surface-muted)] mb-1.5">{t("body.sleep.quality")}</p>
              <div className="flex gap-2">
                {(["good", "normal", "poor"] as SleepQuality[]).map(q => (
                  <button key={q} onClick={() => setSleepQuality(q)}
                    className={clsx("flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all",
                      sleepQuality === q ? "text-white border-transparent" : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)]")}
                    style={sleepQuality === q ? { backgroundColor: SLEEP_COLORS[q] } : {}}>
                    {SLEEP_LABELS[q]}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <input className="input-base pr-6" type="number" inputMode="decimal" step="0.5" placeholder={`${t("body.sleep.hours")}（${t("common.optional")}）`}
                value={sleepHours} onChange={e => setSleepHours(e.target.value)} />
              <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">h</span>
            </div>

            <input className="input-base" placeholder={`${t("body.sleep.notes")}（${t("common.optional")}）`}
              value={sleepNotes} onChange={e => setSleepNotes(e.target.value)} />

            {sleepFormErr && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} className="shrink-0" /> {sleepFormErr}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowSleepForm(false); setSleepFormErr(null); }} className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
              <button onClick={saveSleep} className="btn-primary flex-1" style={{ backgroundColor: SLEEP_COLORS[sleepQuality] }}>{t("common.save")}</button>
            </div>
        </Dialog>
      )}
    </div>
  );
}
