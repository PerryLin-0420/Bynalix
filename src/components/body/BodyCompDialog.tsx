import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertCircle, X } from "lucide-react";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { checkBound, BOUNDS } from "@/lib/validate";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import { TimePicker } from "@/components/TimePicker";
import { SummaryTabs } from "@/components/food/DrinkOptions";
import {
  SEGMENTS, applyLbm, fatKey, muscleKey, replacesLbm, segmentTotal, weightForDate,
  type CompEntry, type DayWeight, type Segment,
} from "@/lib/bodyComp";

type Tab = "basic" | "muscle" | "fat";

const BASIC_FIELDS = ["body_fat_pct", "body_water_kg", "visceral_fat_level", "waist_cm"] as const;
type BasicKey = typeof BASIC_FIELDS[number];
type SegKey = ReturnType<typeof muscleKey> | ReturnType<typeof fatKey>;
type FormKey = BasicKey | SegKey;
type Form = Record<FormKey, string>;

const ALL_KEYS: FormKey[] = [...BASIC_FIELDS, ...SEGMENTS.map(muscleKey), ...SEGMENTS.map(fatKey)];

const BASIC_COLOR: Record<BasicKey, string> = {
  body_fat_pct: "#f97316", body_water_kg: "#0ea5e9", visceral_fat_level: "#8b5cf6", waist_cm: "#ec4899",
};
const MUSCLE_COLOR = "#10b981";
const FAT_COLOR    = "#f97316";

const SEG_BOUND = (kind: "muscle" | "fat", s: Segment) =>
  kind === "muscle"
    ? (s === "trunk" ? BOUNDS.muscleTrunk : s.endsWith("arm") ? BOUNDS.muscleArm : BOUNDS.muscleLeg)
    : (s === "trunk" ? BOUNDS.fatTrunk    : s.endsWith("arm") ? BOUNDS.fatArm    : BOUNDS.fatLeg);

const num = (v: string) => (v.trim() === "" ? null : parseFloat(v));
const round1 = (v: number) => Math.round(v * 10) / 10;

function formFrom(e: CompEntry | null): Form {
  const f = Object.fromEntries(ALL_KEYS.map(k => [k, ""])) as Form;
  if (e) for (const k of ALL_KEYS) { const v = e[k]; if (v != null) f[k] = String(v); }
  return f;
}

/**
 * Add / edit one body-composition measurement in a dialog split into
 * Basics / Muscle / Fat tabs; the two segment tabs place their five inputs on
 * a gingerbread silhouette. A body-fat % here is a measurement, so saving it can
 * replace the lean body mass the targets use (see lib/bodyComp) — the footer
 * says what will change before it does.
 */
export function BodyCompDialog({ entry, defaultDate, onClose, onSaved }: {
  entry: CompEntry | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile, lbmKg, lbmDate } = useUserStore();
  const { t, lang } = useLangStore();
  const zh = lang === "zh";
  const today = format(new Date(), "yyyy-MM-dd");

  const [tab, setTab]     = useState<Tab>("basic");
  const [form, setForm]   = useState<Form>(() => formFrom(entry));
  const [date, setDate]   = useState(entry?.log_date ?? defaultDate);
  const [time, setTime]   = useState(entry?.log_time?.slice(0, 5) ?? format(new Date(), "HH:mm"));
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [err, setErr]     = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dayWeight, setDayWeight] = useState<DayWeight | null>(null);
  const [updateLbm, setUpdateLbm] = useState(true);

  useEffect(() => {
    if (!profile) return;
    weightForDate(profile.user_id, date).then(setDayWeight).catch(() => setDayWeight(null));
  }, [profile, date]);

  const set = (k: FormKey, v: string) => setForm(f => ({ ...f, [k]: v }));

  const bf = num(form.body_fat_pct);
  const muscleTotal = segmentTotal(SEGMENTS.map(s => num(form[muscleKey(s)])));
  const fatTotal    = segmentTotal(SEGMENTS.map(s => num(form[fatKey(s)])));

  // What saving this does to LBM
  const lbmWeight = dayWeight?.kg ?? profile?.weight_kg ?? null;
  const newLbm = bf != null && bf > 0 && bf < 100 && lbmWeight ? round1(lbmWeight * (1 - bf / 100)) : null;
  const lbmApplies = newLbm != null && replacesLbm(date, lbmDate);

  const fmtShort = (d: string) => format(parseISO(d), "M/d");
  const LABELS: Record<BasicKey, string> = {
    body_fat_pct: t("body.bodyFat"), body_water_kg: t("body.water"),
    visceral_fat_level: t("body.visceralFat"), waist_cm: t("body.waist"),
  };
  const UNITS: Record<BasicKey, string> = {
    body_fat_pct: "%", body_water_kg: "kg", visceral_fat_level: t("body.visceralUnit"), waist_cm: "cm",
  };

  const tabs = [
    { key: "basic" as const,  title: zh ? "基礎資料" : "Basics",
      value: bf != null ? `${zh ? "體脂" : "BF"} ${bf}%` : (zh ? "未填" : "—") },
    { key: "muscle" as const, title: zh ? "肌肉" : "Muscle", value: muscleTotal != null ? `${muscleTotal} kg` : (zh ? "未填" : "—") },
    { key: "fat" as const,    title: zh ? "脂肪" : "Fat",    value: fatTotal    != null ? `${fatTotal} kg`    : (zh ? "未填" : "—") },
  ];

  const save = async () => {
    if (!profile) return;
    if (!ALL_KEYS.some(k => form[k].trim() !== "")) { setErr(zh ? "請至少填入一項" : "Fill in at least one value"); return; }
    const e =
      checkBound(form.body_fat_pct,       BOUNDS.bodyFat,     lang) ??
      checkBound(form.body_water_kg,      BOUNDS.bodyWater,   lang) ??
      checkBound(form.visceral_fat_level, BOUNDS.visceralFat, lang) ??
      checkBound(form.waist_cm,           BOUNDS.waist,       lang) ??
      SEGMENTS.map(s => checkBound(form[muscleKey(s)], SEG_BOUND("muscle", s), lang)).find(Boolean) ??
      SEGMENTS.map(s => checkBound(form[fatKey(s)],    SEG_BOUND("fat", s),    lang)).find(Boolean) ?? null;
    if (e) { setErr(e); return; }
    setErr(null);
    setSaving(true);
    try {
      const db = await getDb();
      const values = [
        num(form.body_fat_pct), muscleTotal,
        ...SEGMENTS.map(s => num(form[muscleKey(s)])),
        ...SEGMENTS.map(s => num(form[fatKey(s)])),
        num(form.body_water_kg),
        form.visceral_fat_level.trim() ? parseInt(form.visceral_fat_level) : null,
        num(form.waist_cm),
        date, time + ":00", notes.trim() || null,
      ];
      const cols = `body_fat_pct, skeletal_muscle_kg,
        ${SEGMENTS.map(muscleKey).join(", ")}, ${SEGMENTS.map(fatKey).join(", ")},
        body_water_kg, visceral_fat_level, waist_cm, log_date, log_time, notes`;
      if (entry) {
        await db.execute(
          `UPDATE body_composition_log SET ${cols.split(",").map(c => `${c.trim()}=?`).join(", ")} WHERE id=?`,
          [...values, entry.id]);
      } else {
        await db.execute(
          `INSERT INTO body_composition_log (user_id, ${cols}) VALUES (${["?", ...values.map(() => "?")].join(",")})`,
          [profile.user_id, ...values]);
      }
      if (lbmApplies && updateLbm && newLbm != null) await applyLbm(profile.user_id, newLbm, date);
      onSaved();
    } catch (ex) {
      logError("BodyCompDialog.save", ex);
      setErr(zh ? "儲存失敗，請再試一次" : "Save failed, please try again");
    } finally {
      setSaving(false);
    }
  };

  const SEG_LABEL: Record<Segment, string> = {
    trunk: t("body.muscleParts.trunk"), left_arm: t("body.muscleParts.leftArm"), right_arm: t("body.muscleParts.rightArm"),
    left_leg: t("body.muscleParts.leftLeg"), right_leg: t("body.muscleParts.rightLeg"),
  };
  const segLabel = (s: Segment) => SEG_LABEL[s];

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[90vh] text-[var(--text-on-surface)]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h3 className="text-lg font-bold">{entry ? (zh ? "編輯身體組成記錄" : "Edit measurement") : t("body.bodyFormTitle")}</h3>
          <button onClick={onClose} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><X size={20} /></button>
        </div>
        <div className="px-5 shrink-0"><SummaryTabs tabs={tabs} active={tab} onSelect={setTab} /></div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4" role="tabpanel">
          {tab === "basic" && (
            <>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("body.recordDate")}</label>
                  <input className="input-base" type="date" value={date} max={today}
                    onChange={ev => ev.target.value && setDate(ev.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("body.recordTime")}</label>
                  <TimePicker value={time} onChange={setTime} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {BASIC_FIELDS.map(k => (
                  <div key={k}>
                    <label className="block text-xs font-medium mb-1" style={{ color: BASIC_COLOR[k] }}>{LABELS[k]}</label>
                    <div className="relative">
                      <input className="input-base pr-10" type="number" inputMode="decimal"
                        value={form[k]} onChange={ev => set(k, ev.target.value)} />
                      <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">{UNITS[k]}</span>
                    </div>
                  </div>
                ))}
              </div>
              <input className="input-base" placeholder={`${t("body.sleep.notes")}（${t("common.optional")}）`}
                value={notes} onChange={ev => setNotes(ev.target.value)} />
            </>
          )}

          {(tab === "muscle" || tab === "fat") && (
            <>
              <GingerbreadFields
                color={tab === "muscle" ? MUSCLE_COLOR : FAT_COLOR}
                keyOf={tab === "muscle" ? muscleKey : fatKey}
                form={form} onChange={set} label={segLabel} />
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-on-surface-muted)]">
                  {zh ? "剪影面向你：本人的右側在畫面左邊" : "The figure faces you: its right side is on your left"}
                </span>
                <span className="font-semibold tabular-nums shrink-0 ml-2" style={{ color: tab === "muscle" ? MUSCLE_COLOR : FAT_COLOR }}>
                  {t("body.muscleTotalLabel")} {(tab === "muscle" ? muscleTotal : fatTotal) ?? "—"} kg
                </span>
              </div>
            </>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-[var(--surface-border)] space-y-2.5 shrink-0">
          {newLbm != null && (lbmApplies ? (
            <label className="flex items-start gap-2 rounded-xl bg-[var(--surface-container)] px-3 py-2 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[var(--color-primary)]" checked={updateLbm}
                onChange={ev => setUpdateLbm(ev.target.checked)} />
              <span className="text-[var(--text-on-surface-sub)]">
                {zh ? "更新去脂體重 " : "Update lean mass "}
                <span className="font-semibold tabular-nums text-[var(--text-on-surface)]">
                  {lbmKg != null ? `${round1(lbmKg)} → ` : ""}{newLbm} kg
                </span>
                {dayWeight
                  ? (zh ? `（依 ${fmtShort(dayWeight.date)}${dayWeight.fasting ? "空腹" : ""}體重 ${dayWeight.kg} kg）` : ` (at ${fmtShort(dayWeight.date)} weight ${dayWeight.kg} kg)`)
                  : (zh ? `（依個人資料體重 ${lbmWeight} kg）` : ` (at profile weight ${lbmWeight} kg)`)}
                {zh ? `，BMR 與蛋白質目標自 ${fmtShort(date)} 起跟著更新` : `; BMR and protein target follow from ${fmtShort(date)}`}
              </span>
            </label>
          ) : (
            <p className="text-xs text-[var(--text-on-surface-muted)]">
              {zh ? `已有較新的量測（${lbmDate && fmtShort(lbmDate)}），這筆不會更新去脂體重`
                  : `A newer measurement exists (${lbmDate && fmtShort(lbmDate)}), so this one won't update lean mass`}
            </p>
          ))}
          {err && (
            <p className="text-xs text-red-500 flex items-center gap-micro"><AlertCircle size={12} className="shrink-0" /> {err}</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
            <button onClick={save} disabled={saving} className="btn-primary bg-[var(--color-primary)] flex-1 disabled:opacity-50">{t("common.save")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where each segment's input sits on the silhouette, as % of the box. The figure faces the viewer. */
const SEG_POS: Record<Segment, { left: string; top: string }> = {
  trunk:     { left: "50%", top: "44%" },
  right_arm: { left: "15%", top: "40%" },
  left_arm:  { left: "85%", top: "40%" },
  right_leg: { left: "31%", top: "84%" },
  left_leg:  { left: "69%", top: "84%" },
};

function GingerbreadFields({ color, keyOf, form, onChange, label }: {
  color: string;
  keyOf: (s: Segment) => SegKey;
  form: Form;
  onChange: (k: FormKey, v: string) => void;
  label: (s: Segment) => string;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[300px] aspect-[5/6]">
      <svg viewBox="0 0 200 240" className="absolute inset-0 w-full h-full" aria-hidden>
        <g fill="#e2b48a" stroke="#b9824f" strokeWidth={3} strokeLinejoin="round">
          {/* arms and legs as thick rounded strokes under the body */}
          <g stroke="#b9824f" strokeLinecap="round" fill="none">
            <line x1="72" y1="80" x2="24" y2="112" strokeWidth={34} />
            <line x1="128" y1="80" x2="176" y2="112" strokeWidth={34} />
            <line x1="84" y1="150" x2="64" y2="214" strokeWidth={38} />
            <line x1="116" y1="150" x2="136" y2="214" strokeWidth={38} />
          </g>
          <g stroke="#e2b48a" strokeLinecap="round" fill="none">
            <line x1="72" y1="80" x2="24" y2="112" strokeWidth={28} />
            <line x1="128" y1="80" x2="176" y2="112" strokeWidth={28} />
            <line x1="84" y1="150" x2="64" y2="214" strokeWidth={32} />
            <line x1="116" y1="150" x2="136" y2="214" strokeWidth={32} />
          </g>
          <rect x="62" y="58" width="76" height="104" rx="30" />
          <circle cx="100" cy="34" r="25" />
        </g>
        {/* icing */}
        <g fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}>
          <path d="M90 42 Q100 50 110 42" />
          <path d="M14 106 l6 8 M184 106 l-6 8 M56 210 l14 0 M130 210 l14 0" />
        </g>
        <g fill="#fff" opacity={0.9}>
          <circle cx="91" cy="30" r="3" /><circle cx="109" cy="30" r="3" />
        </g>
      </svg>
      {SEGMENTS.map(s => (
        <div key={s} className="absolute -translate-x-1/2 -translate-y-1/2 w-[72px] text-center"
          style={SEG_POS[s]}>
          <span className="block text-10 font-semibold mb-0.5 drop-shadow-sm" style={{ color }}>{label(s)}</span>
          <div className="relative">
            <input
              className={clsx("w-full rounded-lg border bg-[var(--surface)]/95 text-center text-sm py-1 pr-5 pl-1",
                "focus:outline-none focus:ring-2 tabular-nums text-[var(--text-on-surface)]")}
              style={{ borderColor: color }}
              type="number" inputMode="decimal" placeholder="—"
              value={form[keyOf(s)]} onChange={ev => onChange(keyOf(s), ev.target.value)} />
            <span className="absolute right-1.5 top-1.5 text-9 text-[var(--text-on-surface-muted)]">kg</span>
          </div>
        </div>
      ))}
    </div>
  );
}
