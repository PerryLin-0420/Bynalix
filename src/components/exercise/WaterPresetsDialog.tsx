import { useRef, useState } from "react";
import { AlertCircle, GripVertical, RotateCcw, X } from "lucide-react";
import { clsx } from "clsx";
import { Dialog } from "@/components/common/Modal";
import { DEFAULT_WATER_PRESETS, WATER_PRESET_MAX } from "@/lib/waterPresets";

interface Props {
  presets: number[];
  onSave: (presets: number[]) => Promise<void>;
  onClose: () => void;
  lang: string;
}

/**
 * Edit the water quick-add buttons: change each amount and drag rows to
 * reorder. The number of buttons stays fixed — only values and order change.
 */
export function WaterPresetsDialog({ presets, onSave, onClose, lang }: Props) {
  const zh = lang === "zh";
  // Each row keeps a stable key so dragging doesn't remount its input
  const [rows, setRows] = useState(() => presets.map((ml, i) => ({ key: i, value: String(ml) })));
  const [dragKey, setDragKey] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  // Pointer-based drag (works with touch, unlike HTML5 drag and drop):
  // while dragging, the row moves to whichever slot the pointer is over.
  const onGripDown = (e: React.PointerEvent, key: number) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragKey(key);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (dragKey === null) return;
    const y = e.clientY;
    setRows(rs => {
      const from = rs.findIndex(r => r.key === dragKey);
      let to = from;
      rs.forEach((r, i) => {
        const el = rowRefs.current.get(r.key);
        if (!el) return;
        const box = el.getBoundingClientRect();
        if (y >= box.top && y <= box.bottom) to = i;
      });
      if (to === from) return rs;
      const next = [...rs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const onGripUp = () => setDragKey(null);

  const save = async () => {
    const values = rows.map(r => Number(r.value));
    if (values.some(v => !Number.isFinite(v) || v <= 0 || v > WATER_PRESET_MAX || !Number.isInteger(v))) {
      setErr(zh ? `每個快捷需為 1–${WATER_PRESET_MAX} 的整數 ml` : `Each shortcut must be a whole number from 1 to ${WATER_PRESET_MAX} ml`);
      return;
    }
    setSaving(true);
    try { await onSave(values); } finally { setSaving(false); }
  };

  return (
    <Dialog opacity="bg-black/60">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--text-on-surface)]">{zh ? "飲水快捷設定" : "Water shortcuts"}</h3>
        <button onClick={onClose} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
          <X size={18} />
        </button>
      </div>
      <p className="text-10 text-[var(--text-on-surface-muted)] -mt-2">
        {zh ? `共 ${rows.length} 個快捷，可修改容量；按住左側把手拖曳排序` : `${rows.length} shortcuts — change the amounts, drag the handle to reorder`}
      </p>

      <div className="space-y-1.5" onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>
        {rows.map((r, i) => (
          <div key={r.key}
            ref={el => { if (el) rowRefs.current.set(r.key, el); else rowRefs.current.delete(r.key); }}
            className={clsx("flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors",
              dragKey === r.key
                ? "border-[var(--color-primary)] bg-[var(--surface-container)] shadow-md"
                : "border-[var(--surface-border)] bg-[var(--surface)]")}>
            <button aria-label={zh ? "拖曳排序" : "Drag to reorder"}
              onPointerDown={e => onGripDown(e, r.key)}
              className="p-1 cursor-grab active:cursor-grabbing text-[var(--text-on-surface-muted)]"
              style={{ touchAction: "none" }}>
              <GripVertical size={16} />
            </button>
            <span className="w-5 text-xs font-mono text-[var(--text-on-surface-muted)] tabular-nums">{i + 1}</span>
            <div className="relative flex-1">
              <input className="input-base pr-10 text-sm" type="number" inputMode="numeric"
                value={r.value}
                onChange={e => { const v = e.target.value; setErr(null); setRows(rs => rs.map(x => x.key === r.key ? { ...x, value: v } : x)); }} />
              <span className="absolute right-3 top-2 text-xs text-[var(--text-on-surface-muted)]">ml</span>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => { setErr(null); setRows(DEFAULT_WATER_PRESETS.map((ml, i) => ({ key: i, value: String(ml) }))); }}
        className="flex items-center gap-micro text-xs text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
        <RotateCcw size={12} /> {zh ? `恢復預設（${DEFAULT_WATER_PRESETS.join("／")}）` : `Reset to default (${DEFAULT_WATER_PRESETS.join(" / ")})`}
      </button>

      {err && (
        <p className="text-xs text-red-500 flex items-center gap-micro">
          <AlertCircle size={12} className="shrink-0" /> {err}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-ghost flex-1">{zh ? "取消" : "Cancel"}</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-40">{zh ? "儲存變更" : "Save changes"}</button>
      </div>
    </Dialog>
  );
}
