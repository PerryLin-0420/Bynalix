import { useState, useRef } from "react";
import { format } from "date-fns";
import { detectOS } from "@/lib/platform";
import { saveImageToGallery, exportElementAsImage } from "@/lib/exportImage";
import { useLangStore } from "@/store/langStore";

export function useImageExport(filenamePrefix: string) {
  const { lang } = useLangStore();
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportStatus, setExportStatus] = useState<"idle" | "saving">("idle");
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleExportImage = async () => {
    if (!exportRef.current || exportStatus === "saving") return;
    setExportStatus("saving");
    const filename = `${filenamePrefix}_${format(new Date(), "yyyyMMdd")}.jpg`;
    let ok = false;
    if (detectOS() === "android") {
      const result = await saveImageToGallery(exportRef.current, filename);
      ok = result === "saved";
      setToastMsg({ text: ok ? (lang === "zh" ? "圖片已儲存" : "Image saved") : (lang === "zh" ? "圖片儲存失敗" : "Save failed"), ok });
      setTimeout(() => setToastMsg(null), 2500);
    } else {
      const result = await exportElementAsImage(exportRef.current, filename);
      if (result === "saved" || result === "error") {
        ok = result === "saved";
        setToastMsg({ text: ok ? (lang === "zh" ? "圖片已儲存" : "Image saved") : (lang === "zh" ? "圖片儲存失敗" : "Save failed"), ok });
        setTimeout(() => setToastMsg(null), 2500);
      }
    }
    setExportStatus("idle");
  };

  return { exportRef, exportStatus, handleExportImage, toastMsg };
}
