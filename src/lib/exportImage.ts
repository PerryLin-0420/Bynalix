/**
 * Chart export: turn one card in the UI into a JPEG on disk.
 *
 * The capture is a rasterised screenshot of the live DOM (html2canvas), not a
 * re-render — so what lands in the file is exactly the chart the user is
 * looking at, with its current range, language and theme, rather than a
 * second drawing path that could drift out of step with the real one.
 *
 * Where the file goes follows the same split as the CSV export in Settings:
 * Android has no save dialog worth the name, so it writes straight into a
 * known folder; everywhere else gets a native "Save As".
 */

import { format } from "date-fns";
import { logError } from "@/lib/error";

const CAPTURE_SCALE = 2;
/**
 * What shows through where the card itself doesn't paint — its rounded
 * corners. White rather than the app's dark teal page background: the export
 * is meant to be pasted somewhere else, and a chart on white drops into a
 * document or a message cleanly, whereas four teal corner wedges do not.
 */
const CAPTURE_BG = "#ffffff";

/**
 * Marks a node as chrome rather than content — the export button itself, and
 * anything else that only makes sense while the page is interactive. Nodes
 * carrying it are skipped by the capture.
 */
export const EXPORT_IGNORE_ATTR = "data-export-ignore";

export type ExportResult = "saved" | "cancelled" | "error";

/**
 * Stamp the capture date into the bottom-right corner.
 *
 * Painted onto the canvas after the fact rather than added to the DOM: the
 * page never carries a stray date node, and the stamp gets sized against the
 * exported pixels instead of whatever the card's layout happened to be. It
 * sits on a translucent plate because a chart line can run right into that
 * corner, and bare grey text over one is unreadable.
 */
function stampDate(canvas: HTMLCanvasElement, date: Date): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // html2canvas leaves its own device-pixel scale on the context; drawing on
  // top of it without resetting puts the stamp at 2x the intended coordinates,
  // i.e. off the canvas entirely.
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const s = CAPTURE_SCALE;
  const text = format(date, "yyyy-MM-dd");
  const fontPx = 11 * s;
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, "Noto Sans TC", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  const w = ctx.measureText(text).width;
  const padX = 6 * s, padY = 3 * s, margin = 8 * s;
  const right = canvas.width - margin;
  const bottom = canvas.height - margin;

  ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
  ctx.fillRect(right - w - padX, bottom - fontPx - padY, w + padX * 2, fontPx + padY * 2);
  ctx.fillStyle = "rgba(55, 65, 81, 0.62)";
  ctx.fillText(text, right, bottom);
}

async function captureCard(el: HTMLElement, date: Date): Promise<Uint8Array> {
  // html2canvas-pro rather than html2canvas: the original measures a font's
  // baseline with a hidden probe appended to `document.body`, which inherits
  // the page's own line-height (24px here) instead of the captured element's.
  // Small text — every legend and caption in this app uses a 14px line box —
  // was drawn ~6px below where the browser puts it, so swatches and labels came
  // apart in the exported image. The fork takes the baseline from the canvas's
  // own font metrics, which does not depend on any element's line-height.
  const html2canvas = (await import("html2canvas-pro")).default;
  const canvas = await html2canvas(el, {
    backgroundColor: CAPTURE_BG,
    scale: CAPTURE_SCALE,
    useCORS: true,
    logging: false,
    ignoreElements: node => node.hasAttribute(EXPORT_IGNORE_ATTR),
  });
  stampDate(canvas, date);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * The native bridge MainActivity injects. Present only inside the Android
 * shell, so every call site treats it as optional.
 */
interface AndroidBridge {
  saveImageToGallery?: (base64Jpeg: string, displayName: string) => string;
}

function androidBridge(): AndroidBridge | undefined {
  return (window as unknown as { AndroidBridge?: AndroidBridge }).AndroidBridge;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked: spreading a few hundred KB into String.fromCharCode at once
  // overflows the argument list on some WebView builds.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Preferred Android target, if the user (or first-run setup) picked one. */
async function preferredDir(): Promise<string | null> {
  try {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    const [row] = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key='image_save_dir'");
    return row?.value ?? null;
  } catch {
    return null; // DB unavailable — the Documents fallback still works
  }
}

/**
 * Android: put the image in the gallery.
 *
 * The first attempt goes through the native bridge, because a file written
 * straight to disk is invisible to every gallery app on the device: they list
 * what MediaStore knows about, and nothing tells MediaStore a new file exists
 * unless the app either inserts the image through it or asks the media scanner
 * to look. That was the whole reason exports "saved" but never appeared.
 *
 * The plain file writes below stay as the fallback for a build without the
 * bridge — the image is at least on disk and reachable through a file manager.
 */
async function saveToGallery(bytes: Uint8Array, filename: string): Promise<ExportResult> {
  const bridge = androidBridge();
  if (bridge?.saveImageToGallery) {
    try {
      const result = bridge.saveImageToGallery(toBase64(bytes), filename);
      if (result === "ok") return "saved";
      logError("exportImage.mediaStore", new Error(result));
    } catch (e) {
      logError("exportImage.mediaStore", e);
    }
    // fall through to the plain file write
  }

  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const { homeDir, join }    = await import("@tauri-apps/api/path");

  const dir = await preferredDir();
  if (dir) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(await join(dir, filename), bytes);
      return "saved";
    } catch (e) {
      logError("exportImage.preferredDir", e); // fall through to Documents
    }
  }

  const imgDir = await join(await homeDir(), "Documents", "Bynalix", "image");
  await mkdir(imgDir, { recursive: true });
  await writeFile(await join(imgDir, filename), bytes);
  return "saved";
}

/**
 * Desktop: native Save As.
 *
 * Defaulted to the Documents folder because the app's fs capability is scoped
 * to $HOME/$DOCUMENT/$DOWNLOAD/$APPDATA — writing somewhere outside those is
 * refused by Tauri, so the dialog should open where the write will succeed.
 */
async function saveViaDialog(bytes: Uint8Array, filename: string, zh: boolean): Promise<ExportResult> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { documentDir, join } = await import("@tauri-apps/api/path");

  let defaultPath = filename;
  try { defaultPath = await join(await documentDir(), filename); } catch { /* keep the bare name */ }

  const path = await save({
    title: zh ? "儲存圖片" : "Save image",
    defaultPath,
    filters: [{ name: zh ? "JPEG 圖片" : "JPEG image", extensions: ["jpg"] }],
  });
  if (!path) return "cancelled";

  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return "saved";
}

/**
 * Capture `el` and write it out. `slug` names the chart; the date is appended
 * so a series of exports of the same chart doesn't collide.
 */
export async function exportCardImage(
  el: HTMLElement,
  slug: string,
  opts: { android: boolean; zh: boolean },
): Promise<ExportResult> {
  try {
    const now = new Date();
    const bytes = await captureCard(el, now);
    const filename = `bynalix_${slug}_${format(now, "yyyyMMdd_HHmmss")}.jpg`;
    return opts.android
      ? await saveToGallery(bytes, filename)
      : await saveViaDialog(bytes, filename, opts.zh);
  } catch (e) {
    logError("exportImage.exportCardImage", e);
    return "error";
  }
}
