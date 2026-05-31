import { Routes, Route } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SplashScreen } from "@/components/SplashScreen";
import { Dashboard } from "@/pages/Dashboard";
import { FoodLog } from "@/pages/FoodLog";
import { ExerciseLog } from "@/pages/ExerciseLog";
import { BodyStatus } from "@/pages/BodyStatus";
import { History } from "@/pages/History";
import { Statistics } from "@/pages/Statistics";
import { Profile } from "@/pages/Profile";
import { Settings } from "@/pages/Settings";
import { getDb } from "@/lib/db";
import { useLangStore } from "@/store/langStore";
import { detectOS } from "@/lib/platform";
import { ToastHost } from "@/components/ui/ToastHost";
import { Lock, Eye, EyeOff, Fingerprint } from "lucide-react";
import { hashPin } from "@/lib/pin";

// ── PIN entry screen ────────────────────────────────────────────────────────
function PinScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLangStore();
  const [digits, setDigits]         = useState<string[]>(["", "", "", ""]);
  const [show, setShow]             = useState(false);
  const [error, setError]           = useState(false);
  const [shaking, setShaking]       = useState(false);
  const [storedHash, setStoredHash] = useState<string>("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const [row] = await db.select<{ value: string }[]>(
          "SELECT value FROM app_settings WHERE key='pin_hash'"
        );
        if (row) setStoredHash(row.value);
      } catch { onUnlock(); }
    })();
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, []);

  const handleDigit = (idx: number, val: string) => {
    if (val.includes(" ")) return;          // block spaces
    if (val.length > 1) val = val.slice(-1);
    const next = [...digits];
    next[idx] = val;
    setDigits(next);
    setError(false);

    if (val && idx < 3) inputRefs.current[idx + 1]?.focus();

    if (val) {
      // Check after every box — supports passwords shorter than 4 chars
      const partial = next.slice(0, idx + 1).join("");
      if (hashPin(partial) === storedHash) {
        onUnlock();
        return;
      }
      // Fail only when all 4 boxes are filled and still no match
      if (idx === 3) {
        setError(true);
        setShaking(true);
        navigator.vibrate?.([80, 40, 80]); // haptic on mobile
        setDigits(["", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-8">
      {/* Icon */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/20 flex items-center justify-center">
          <Lock size={30} className="text-teal-400" />
        </div>
          <h1 className="text-2xl font-bold text-white">Bynálix</h1>
          <p className="text-gray-400 text-sm">{t("pin.subtitle")}</p>
        </div>

      {/* 4-box PIN input */}
      <div
        className={`flex gap-4 ${shaking ? "animate-shake" : ""}`}
        onAnimationEnd={() => setShaking(false)}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            type={show ? "text" : "password"}
            inputMode="text"
            maxLength={1}
            value={d}
            onChange={e => handleDigit(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className={[
              "w-14 h-14 rounded-2xl text-center text-xl font-bold bg-gray-800 text-white",
              "border-2 outline-none transition-all",
              error
                ? "border-red-500"
                : d ? "border-teal-400" : "border-gray-700 focus:border-teal-500",
            ].join(" ")}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm -mt-4">{t("pin.error")}</p>
      )}

      {/* Show/hide toggle */}
      <button
        onClick={() => setShow(s => !s)}
        className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-sm transition-colors"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
        {show ? t("pin.hide") : t("pin.show")}
      </button>
    </div>
  );
}

// ── Biometric lock screen (Android only) ────────────────────────────────────
function BiometricScreen({ onUnlock }: { onUnlock: () => void }) {
  const { lang } = useLangStore();
  const [failed, setFailed] = useState(false);

  const tryAuth = async () => {
    setFailed(false);
    try {
      const { authenticate } = await import("@tauri-apps/plugin-biometric");
      await authenticate(
        lang === "zh" ? "請驗證身分以開啟 Bynálix" : "Authenticate to open Bynálix",
        { allowDeviceCredential: true }
      );
      onUnlock();
    } catch (e: any) {
      // User cancelled (AbortError / UserCancel) → keep screen, don't mark failed
      const msg = String(e?.message ?? e).toLowerCase();
      if (msg.includes("cancel") || msg.includes("abort") || msg.includes("user")) return;
      setFailed(true);
    }
  };

  useEffect(() => {
    const t = setTimeout(tryAuth, 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center gap-6 p-8 select-none">
      <div className="w-20 h-20 rounded-full bg-teal-500/20 flex items-center justify-center">
        <Fingerprint size={40} className="text-teal-400" />
      </div>
      <p className="text-white text-xl font-bold">Bynálix</p>
      {failed && (
        <>
          <p className="text-red-400 text-sm text-center">
            {lang === "zh" ? "驗證失敗，請重試" : "Authentication failed, please try again"}
          </p>
          <button onClick={tryAuth}
            className="px-6 py-2.5 rounded-xl bg-teal-500 text-white text-sm font-semibold">
            {lang === "zh" ? "重試" : "Retry"}
          </button>
        </>
      )}
    </div>
  );
}

// ── Pre-create folder structure + request permissions on Android ──────────────
async function initGalleryFolder() {
  if (detectOS() !== "android") return;
  try {
    const { mkdir } = await import("@tauri-apps/plugin-fs");
    const { homeDir, join } = await import("@tauri-apps/api/path");
    const home = await homeDir();

    // ── Request storage permissions (triggers Android system dialog) ─────────
    // requestPermissions() covers WRITE_EXTERNAL_STORAGE on Android ≤ 12 and
    // granular media permissions on Android 13+. Called unconditionally so the
    // user sees the prompt on first launch rather than at backup time.
    try {
      const fsModule = await import("@tauri-apps/plugin-fs") as any;
      if (typeof fsModule.requestPermissions === "function") {
        await fsModule.requestPermissions().catch(() => {});
      }
    } catch { /* Permission API unavailable on this platform — proceed */ }

    // ── Documents/Bynalix/{image,database,csv} ────────────────────────────────
    const base = await join(home, "Documents", "Bynalix");
    await mkdir(await join(base, "image"),    { recursive: true });
    await mkdir(await join(base, "database"), { recursive: true });
    await mkdir(await join(base, "csv"),      { recursive: true });

    // ── Try DCIM/Bynalix — preferred location for gallery visibility ───────────
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    try {
      const dcimDir = await join(home, "DCIM", "Bynalix");
      await mkdir(dcimDir, { recursive: true });
      // Record DCIM as the preferred image save directory
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('image_save_dir', ?)",
        [dcimDir]
      );
    } catch {
      // DCIM inaccessible — fall back to Documents for image saves
      const docsImgDir = await join(base, "image");
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('image_save_dir', ?)",
        [docsImgDir]
      ).catch(() => {});
    }
  } catch { /* ignore */ }
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState]           = useState<"loading" | "splash" | "pin" | "biometric" | "ready">("loading");
  const [quickSplash, setQuickSplash]     = useState(false);
  const skipPinCheckRef                   = useRef(false); // true when coming from PIN unlock
  const { loadLang } = useLangStore();

  useEffect(() => {
    loadLang();
    checkStartup();
    initGalleryFolder();
  }, []);

  const checkStartup = async () => {
    try {
      const db = await getDb();

      // 1. Check first-launch flag
      const launchRows = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='first_launch_done'"
      );
      const isFirstLaunch = launchRows.length === 0;

      // 2. Read all relevant settings in one query
      const settingRows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM app_settings WHERE key IN ('startup_lock_enabled','pin_hash','pin_enabled')"
      );
      const map = Object.fromEntries(settingRows.map(r => [r.key, r.value]));

      if (isFirstLaunch) {
        await db.execute(
          "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('first_launch_done', '1')"
        );
      }

      if (map["startup_lock_enabled"] === "1") {
        if (detectOS() === "android") {
          setAppState("biometric");
          return;
        }
        // Desktop: require pin_hash + pin_enabled
        if (!!map["pin_hash"] && map["pin_enabled"] === "1") {
          setAppState("pin");
          return;
        }
      }

      // Show splash — full on first launch, quick on subsequent
      setQuickSplash(!isFirstLaunch);
      setAppState("splash");
    } catch {
      setAppState("ready");
    }
  };

  // Called when PIN is verified — go through quick splash to avoid abrupt flash
  const handlePinUnlock = () => {
    skipPinCheckRef.current = true;
    setQuickSplash(true);
    setAppState("splash");
  };

  const handleSplashDone = async () => {
    // Coming from PIN unlock — skip PIN re-check and go straight to ready
    if (skipPinCheckRef.current) {
      skipPinCheckRef.current = false;
      setAppState("ready");
      return;
    }
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('first_launch_done', '1')"
      );
      // Only re-enter pin if startup lock is explicitly on
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM app_settings WHERE key IN ('startup_lock_enabled','pin_hash','pin_enabled')"
      );
      const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
      if (m["startup_lock_enabled"] === "1") {
        if (detectOS() === "android") {
          setAppState("biometric");
          return;
        }
        if (!!m["pin_hash"] && m["pin_enabled"] === "1") {
          setAppState("pin");
          return;
        }
      }
    } catch (e) { void e; /* startup checks: best-effort */ }
    setAppState("ready");
  };

  if (appState === "loading") {
    return <div className="fixed inset-0 bg-teal-500" />;
  }

  if (appState === "splash") {
    return <SplashScreen onDone={handleSplashDone} quick={quickSplash} />;
  }

  if (appState === "pin") {
    return <PinScreen onUnlock={handlePinUnlock} />;
  }

  if (appState === "biometric") {
    return <BiometricScreen onUnlock={handlePinUnlock} />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Status bar safe area cover — solid bg so content never bleeds through on scroll */}
      <div 
      className="fixed top-0 left-0 w-full z-[9999] bg-gray-950"
      style={{ height: "env(safe-area-inset-top)" }}
    />
      {/* Desktop sidebar */}
      <Sidebar />
      {/* Page content — add bottom padding on mobile for the bottom nav */}
      <main 
      className="flex-1 overflow-y-auto pb-16 md:pb-0"
      style={{ 
        paddingTop: "env(safe-area-inset-top)",}}>
      <Routes>
        <Route path="/"          element={<Dashboard />} />
        <Route path="/food"      element={<FoodLog />} />
        <Route path="/exercise"  element={<ExerciseLog />} />
        <Route path="/body"      element={<BodyStatus />} />
        <Route path="/history"   element={<History />} />
        <Route path="/stats"     element={<Statistics />} />
        <Route path="/profile"   element={<Profile />} />
        <Route path="/settings"  element={<Settings />} />
      </Routes>
    </main>
      {/* Mobile bottom nav */}
      <BottomNav />
      <ToastHost />
  </div>
);
}
