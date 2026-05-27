/**
 * Saves a DOM element as JPEG.
 *
 * Save order on Android:
 *   1. Preferred dir stored in app_settings['image_save_dir']
 *      (set to DCIM/Bynalix by initGalleryFolder if accessible)
 *   2. Fallback → Documents/Bynalix/image
 *
 * Returns "saved" | "error"
 */
export async function saveImageToGallery(
  el: HTMLElement,
  filename: string
): Promise<"saved" | "error"> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(el, {
      backgroundColor: "#f9fafb",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.92)
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
    const { homeDir, join }    = await import("@tauri-apps/api/path");
    const home = await homeDir();

    // ── Read preferred save directory ──────────────────────────────────────────
    let preferredDir: string | null = null;
    try {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      const [row] = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='image_save_dir'"
      );
      if (row?.value) preferredDir = row.value;
    } catch { /* DB unavailable — skip */ }

    // ── Try preferred directory (e.g. DCIM/Bynalix) ───────────────────────────
    if (preferredDir) {
      try {
        await mkdir(preferredDir, { recursive: true });
        await writeFile(await join(preferredDir, filename), bytes);
        return "saved";
      } catch {
        console.warn("[saveImageToGallery] preferred dir failed, falling back to Documents");
      }
    }

    // ── Fallback: Documents/Bynalix/image ─────────────────────────────────────
    const imgDir = await join(home, "Documents", "Bynalix", "image");
    try { await mkdir(imgDir, { recursive: true }); } catch (e: any) {
      const msg = String(e?.message ?? e).toLowerCase();
      if (!msg.includes("exist") && !msg.includes("os error 17")) throw e;
    }
    await writeFile(await join(imgDir, filename), bytes);
    return "saved";
  } catch (e) {
    console.error("[saveImageToGallery]", e);
    return "error";
  }
}

/**
 * Captures a DOM element as a JPEG and shows a native "Save As" dialog.
 * Uses html2canvas + @tauri-apps/plugin-dialog + @tauri-apps/plugin-fs.
 */
export async function exportElementAsImage(
  el: HTMLElement,
  defaultFilename: string
): Promise<"saved" | "cancelled" | "error"> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(el, {
      backgroundColor: "#f9fafb",
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", 0.92)
    );
    const buffer = await blob.arrayBuffer();
    const bytes  = new Uint8Array(buffer);

    const { save } = await import("@tauri-apps/plugin-dialog");
    const savePath = await save({
      title: "儲存圖片",
      defaultPath: defaultFilename,
      filters: [{ name: "JPEG 圖片", extensions: ["jpg"] }],
    });

    if (!savePath) return "cancelled";

    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(savePath, bytes);

    return "saved";
  } catch (e) {
    console.error("[exportImage]", e);
    return "error";
  }
}
