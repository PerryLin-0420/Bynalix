export type Platform = "android" | "windows" | "macos" | "web";

/**
 * Detect the current operating system using navigator.userAgent.
 * Does not require window.__TAURI__ since this is a Tauri-only desktop app.
 */
export function detectOS(): Platform {
  if (typeof window === "undefined") return "web";

  const ua = navigator.userAgent;
  if (ua.includes("Android")) return "android";
  if (ua.includes("Win"))     return "windows";
  if (ua.includes("Mac"))     return "macos";

  return "web";
}

export function isTauriApp(): boolean {
  return typeof window !== "undefined" && (
    !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  );
}
