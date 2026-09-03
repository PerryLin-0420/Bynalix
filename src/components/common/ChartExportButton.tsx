import { useRef, useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { detectOS } from "@/lib/platform";
import { exportCardImage, EXPORT_IGNORE_ATTR } from "@/lib/exportImage";
import { useLangStore } from "@/store/langStore";
import { showToast } from "@/store/toastStore";

interface Props {
  /** Short identifier for this chart; becomes part of the saved filename. */
  slug: string;
}

/**
 * "Save this chart as an image", dropped in as the last child of a card.
 *
 * It finds what to capture by walking up to its own enclosing `.card` rather
 * than taking a ref, so adding export to a chart is one self-contained line at
 * the bottom of the card instead of threading a ref down through whatever
 * component owns it. It also carries the ignore attribute, so the button never
 * appears in the image it produces.
 */
export function ChartExportButton({ slug }: Props) {
  const { lang } = useLangStore();
  const zh = lang === "zh";
  const btnRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const card = btnRef.current?.closest<HTMLElement>(".card");
    if (!card || busy) return;
    setBusy(true);
    const result = await exportCardImage(card, slug, { android: detectOS() === "android", zh });
    if (result === "saved")      showToast(zh ? "圖片已儲存" : "Image saved", "ok");
    else if (result === "error") showToast(zh ? "圖片儲存失敗" : "Save failed", "error");
    setBusy(false);
  };

  return (
    <div className="flex justify-end pt-1.5 -mb-1.5" {...{ [EXPORT_IGNORE_ATTR]: "" }}>
      <button ref={btnRef} onClick={handleClick} disabled={busy}
        title={zh ? "輸出圖片" : "Export image"}
        aria-label={zh ? "輸出圖片" : "Export image"}
        className="p-1.5 rounded-lg text-[var(--text-on-surface-muted)] transition-colors
          hover:text-[var(--text-accent)] hover:bg-[var(--surface-container-low)]
          disabled:opacity-40 disabled:cursor-wait">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />}
      </button>
    </div>
  );
}
