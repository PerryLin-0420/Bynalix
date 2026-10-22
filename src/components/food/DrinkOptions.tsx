import { useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import {
  CUP_PRESETS, SUGAR_LEVELS, TOPPING_STEP, adjustableSugar,
  type DrinkFoodFields, type DrinkOpts, type Topping,
} from "@/lib/drink";

export interface NewTopping {
  name: string; protein_g: number; carbohydrates_g: number; fat_g: number; sugar_g: number;
}

interface Props {
  food: DrinkFoodFields;
  qty: string;
  onQty: (v: string) => void;
  opts: DrinkOpts;
  onOpts: (o: DrinkOpts) => void;
  toppings: Topping[];
  onAddTopping: (t: NewTopping) => Promise<void>;
  onDeleteTopping: (t: Topping) => Promise<void>;
  lang: string;
}

const chip = (active: boolean) => clsx(
  "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
  active
    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
    : "border-[var(--surface-border)] text-[var(--text-on-surface-sub)] hover:border-[var(--color-outline)]");

/**
 * The advanced-drink block under a picked drink: cup size (shortcuts + ml),
 * sugar level, and toppings with free serving counts.
 */
export function DrinkOptions({ food, qty, onQty, opts, onOpts, toppings, onAddTopping, onDeleteTopping, lang }: Props) {
  const zh = lang === "zh";
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", p: "", c: "", f: "", sugar: "" });

  const tName = (t: Topping) => (!zh && t.name_en) ? t.name_en : t.name;
  const byId = new Map(toppings.map(t => [t.topping_id, t]));
  const sugarAdjustable = adjustableSugar(food) > 0;
  const qtyNum = parseFloat(qty) || 0;

  const setToppingQty = (id: number, q: number) => {
    const next = q <= 0
      ? opts.toppings.filter(p => p.id !== id)
      : opts.toppings.some(p => p.id === id)
        ? opts.toppings.map(p => p.id === id ? { ...p, qty: q } : p)
        : [...opts.toppings, { id, qty: q }];
    onOpts({ ...opts, toppings: next });
  };

  const draftKcal = Math.round((parseFloat(draft.p) || 0) * 4 + (parseFloat(draft.c) || 0) * 4 + (parseFloat(draft.f) || 0) * 9);

  const saveDraft = async () => {
    if (!draft.name.trim()) return;
    await onAddTopping({
      name: draft.name.trim(),
      protein_g: parseFloat(draft.p) || 0, carbohydrates_g: parseFloat(draft.c) || 0,
      fat_g: parseFloat(draft.f) || 0, sugar_g: parseFloat(draft.sugar) || 0,
    });
    setDraft({ name: "", p: "", c: "", f: "", sugar: "" });
    setCreating(false);
  };

  const label = "text-10 font-semibold text-[var(--text-on-surface-muted)] uppercase tracking-wide mb-1.5";

  return (
    <div className="space-y-3 mt-3">
      {/* Cup size */}
      <div>
        <p className={label}>{zh ? "杯量" : "Cup size"}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {CUP_PRESETS.map(c => (
            <button key={c.ml} onClick={() => onQty(String(c.ml))} className={chip(qtyNum === c.ml)}>
              {zh ? c.zh : c.en} <span className="opacity-70">{c.ml}</span>
            </button>
          ))}
          <span className="inline-flex items-center gap-1">
            <input className="input-base w-24 text-sm" type="number" inputMode="decimal"
              value={qty} onChange={e => onQty(e.target.value)} />
            <span className="text-xs text-[var(--text-on-surface-muted)]">ml</span>
          </span>
        </div>
      </div>

      {/* Sugar level */}
      <div>
        <p className={label}>{zh ? "甜度" : "Sugar"}</p>
        {sugarAdjustable ? (
          <div className="flex flex-wrap gap-1.5">
            {SUGAR_LEVELS.map(l => (
              <button key={l.ratio} onClick={() => onOpts({ ...opts, sugar: l.ratio })} className={chip(opts.sugar === l.ratio)}>
                {zh ? l.zh : l.en}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-on-surface-muted)]">{zh ? "這杯的糖無法調整" : "Sugar can't be adjusted for this drink"}</p>
        )}
      </div>

      {/* Toppings */}
      <div>
        <p className={label}>{zh ? "配料（每份）" : "Toppings (per serving)"}</p>
        <div className="space-y-1">
          {opts.toppings.map(p => {
            const t = byId.get(p.id);
            if (!t) return null;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-xs text-[var(--text-on-surface)] truncate">
                  {tName(t)} <span className="text-[var(--text-on-surface-muted)]">· {Math.round(t.calories_kcal * p.qty)} kcal</span>
                </span>
                <button onClick={() => setToppingQty(p.id, p.qty - TOPPING_STEP)}
                  className="icon-btn text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><Minus size={14} /></button>
                <span className="w-8 text-center text-xs font-mono font-semibold tabular-nums">{p.qty}</span>
                <button onClick={() => setToppingQty(p.id, p.qty + TOPPING_STEP)}
                  className="icon-btn text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><Plus size={14} /></button>
              </div>
            );
          })}
        </div>
        <button onClick={() => setPicking(v => !v)}
          className="mt-1.5 flex items-center gap-micro text-xs text-[var(--text-accent-mid)] hover:text-[var(--text-accent)]">
          <Plus size={12} /> {zh ? "加配料" : "Add topping"}
        </button>

        {picking && (
          <div className="mt-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-2 space-y-1">
            <div className="flex flex-wrap gap-1.5">
              {toppings.map(t => {
                const picked = opts.toppings.some(p => p.id === t.topping_id);
                return (
                  <span key={t.topping_id} className="inline-flex items-center">
                    <button onClick={() => setToppingQty(t.topping_id, (opts.toppings.find(p => p.id === t.topping_id)?.qty ?? 0) + 1)}
                      className={chip(picked)}>
                      {tName(t)} <span className="opacity-70">{Math.round(t.calories_kcal)}</span>
                    </button>
                    {t.source_type === "custom" && (
                      <button onClick={() => onDeleteTopping(t)} title={zh ? "刪除自訂配料" : "Delete custom topping"}
                        className="p-1 text-red-400 hover:text-red-500"><Trash2 size={12} /></button>
                    )}
                  </span>
                );
              })}
            </div>
            {!creating ? (
              <button onClick={() => setCreating(true)}
                className="flex items-center gap-micro text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] pt-1">
                <Plus size={12} /> {zh ? "自訂配料" : "Custom topping"}
              </button>
            ) : (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input className="input-base text-sm flex-1" placeholder={zh ? "配料名稱" : "Topping name"}
                    value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                  <button onClick={() => setCreating(false)} className="icon-btn text-[var(--text-on-surface-muted)]"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {([["p", zh ? "蛋白質" : "Protein"], ["c", zh ? "碳水" : "Carbs"], ["f", zh ? "脂肪" : "Fat"], ["sugar", zh ? "其中糖" : "of which sugar"]] as const).map(([k, ph]) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <span className="w-12 shrink-0 text-10 text-[var(--text-on-surface-muted)]">{ph}</span>
                      <input className="input-base text-sm min-w-0" type="number" inputMode="decimal" placeholder="0"
                        value={draft[k]} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />
                      <span className="text-10 text-[var(--text-on-surface-muted)]">g</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-10 text-[var(--text-on-surface-muted)]">{zh ? "每份" : "Per serving"} · {draftKcal} kcal</span>
                  <button onClick={saveDraft} disabled={!draft.name.trim()}
                    className="btn-primary px-3 py-1 text-xs disabled:opacity-40">{zh ? "新增" : "Add"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
