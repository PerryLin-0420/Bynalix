export type Platform = "android" | "windows" | "macos" | "web";

/**
 * Detect the current operating system.
 *
 * Note: This still uses navigator.userAgent. The recommended long-term fix is
 * `@tauri-apps/plugin-os` (more robust on mobile and survives Tauri version
 * bumps), but that requires Cargo + capability changes. The UA path below
 * handles the most common pitfall — iPadOS 13+ Safari claims to be Mac —
 * which previously caused iPads to be misreported as macOS.
 */
export function detectOS(): Platform {
  if (typeof window === "undefined") return "web";

  const ua = navigator.userAgent;
  if (ua.includes("Android")) return "android";

  // iPad on iPadOS 13+ ships a desktop-Safari UA; distinguish via touch points.
  // (Real Macs report maxTouchPoints === 0 unless a Touch Bar / external touch
  // surface is attached, which is rare.)
  const isiPad = ua.includes("Mac") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  if (isiPad) return "web";

  if (ua.includes("Win")) return "windows";
  if (ua.includes("Mac")) return "macos";

  return "web";
}

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && (
    !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  );
}
