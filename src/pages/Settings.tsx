import { useState, useEffect, useRef, useCallback } from "react";
import { useSwipeTabs } from "@/hooks/useSwipe";
import {
  Settings2, Shield, Download, Upload, Database,
  Eye, EyeOff, Check, X, AlertCircle, FileDown,
  FolderOpen, Lock, Trash2,
} from "lucide-react";
import { clsx } from "clsx";
import { getDb } from "@/lib/db";
import { logError } from "@/lib/error";
import { hashPin } from "@/lib/pin";
import { showToast } from "@/store/toastStore";
import { useUserStore } from "@/store/userStore";
import { useLangStore } from "@/store/langStore";
import type { Lang } from "@/lib/i18n";
import { detectOS } from "@/lib/platform";
import JSZip from "jszip";

const APP_VERSION = "1.1.0";

// ─── Helpers ─────────────────────────────────────────────────────────────────


function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines   = [
    headers.join(","),
    ...rows.map(r =>
      headers.map(h => {
        const v = r[h] == null ? "" : String(r[h]);
        return v.includes(",") || v.includes('"') || v.includes("\n")
          ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    ),
  ];
  return lines.join("\n");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Settings() {
  const { profile } = useUserStore();
  const { t, lang, setLang } = useLangStore();
  const [tab, setTab] = useState<"general" | "security" | "data">("general");
  const SETTINGS_TABS = ["general", "security", "data"] as const;
  const settingsSwipe = useSwipeTabs(SETTINGS_TABS, tab, useCallback((t: string) => setTab(t as "general" | "security" | "data"), []));

  // ── Password state ──────────────────────────────────────────────────────────
  const [pinEnabled, setPinEnabled]     = useState(false); // pin_enabled = "1"
  const [hasStoredPin, setHasStoredPin] = useState(false); // pin_hash exists
  const [currentPin, setCurrentPin]     = useState<string | null>(null);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinInput, setPinInput]         = useState("");
  const [pinConfirm, setPinConfirm]     = useState("");
  const [pinError, setPinError]         = useState("");
  const [showPin, setShowPin]           = useState(false);

  // ── Startup lock state ─────────────────────────────────────────────────────
  const [startupLockEnabled, setStartupLockEnabled] = useState(false);
  const [os, setOs] = useState<"android" | "windows" | "macos" | "web">("web");
  const [showStartupWarning, setShowStartupWarning] = useState(false);

  // ── Local sync state ────────────────────────────────────────────────────────
  const [syncPath, setSyncPath]             = useState<string>("");
  const [syncing, setSyncing]               = useState(false);
  const [syncMsg, setSyncMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  // ── Reset state ─────────────────────────────────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting]               = useState(false);
  const [resetMsg, setResetMsg]                 = useState<{ ok: boolean; text: string } | null>(null);

  // ── Export / Import state ───────────────────────────────────────────────────
  const [exporting, setExporting]               = useState(false);
  const [importing, setImporting]               = useState(false);
  const [importMsg, setImportMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [importDbPath, setImportDbPath]         = useState<string | null>(null);
  const [importKey, setImportKey]               = useState<string | undefined>(undefined);
  const [showImportConfirm, setShowImportConfirm]   = useState(false);
  const [showImportPinModal, setShowImportPinModal] = useState(false);
  const [importPinDigits, setImportPinDigits]   = useState(["", "", "", ""]);
  const [importPinError, setImportPinError]     = useState("");
  const importPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── CSV encryption state ────────────────────────────────────────────────────
  const [encryptCsv, setEncryptCsv]         = useState(false);
  const [showEncryptModal, setShowEncryptModal] = useState(false);
  const [exportPinInput, setExportPinInput] = useState("");
  const [exportPinError, setExportPinError] = useState("");

  const EXPORT_TABLES = [
    "user_profile", "weight_log", "meal_log", "exercise_log",
    "water_log", "strength_session", "strength_set",
    "running_session", "running_interval",
    "body_composition_log", "sleep_log", "food_database",
  ];

  useEffect(() => {
    loadPinStatus();
    loadSyncSettings();
    loadStartupLockStatus();
    loadEncryptCsvSetting();
    setOs(detectOS());
  }, []);

  // On Windows/macOS: if password is disabled, auto-disable startup lock
  useEffect(() => {
    const currentOs = detectOS();
    if ((currentOs === "windows" || currentOs === "macos") && !pinEnabled && startupLockEnabled) {
      saveStartupLockEnabled(false);
    }
  }, [pinEnabled, startupLockEnabled]);

  const loadEncryptCsvSetting = async () => {
    try {
      const db = await getDb();
      const [row] = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='encrypt_csv'"
      );
      if (row) setEncryptCsv(row.value === "1");
    } catch (e) { logError("Settings", e); }
  };

const loadStartupLockStatus = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM app_settings WHERE key='startup_lock_enabled'"
      );
      if (rows.length > 0) {
        setStartupLockEnabled(rows[0].value !== "0");
      }
    } catch (e) { logError("Settings", e); }
  };

  const loadSyncSettings = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM app_settings WHERE key = 'sync_path'"
      );
      for (const r of rows) {
        if (r.key === "sync_path") setSyncPath(r.value);
      }
    } catch (e) { logError("Settings", e); }
  };

  const saveStartupLockEnabled = async (val: boolean) => {
    setStartupLockEnabled(val);
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('startup_lock_enabled', ?)",
        [val ? "1" : "0"]
      );
    } catch (e) { logError("Settings", e); }
  };

  const handleStartupLockToggle = async () => {
    // Already enabled → always allow turning off, regardless of platform
    if (startupLockEnabled) {
      await saveStartupLockEnabled(false);
      return;
    }

    // Not yet enabled:
    // Android/Web → enable directly (no password required)
    if (os === "android" || os === "web") {
      await saveStartupLockEnabled(true);
      return;
    }

    // Windows/macOS → require password first
    if (!pinEnabled) {
      const pinCard = document.querySelector('[data-pin-section]');
      pinCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Has password → show security warning
    setShowStartupWarning(true);
  };

  const pickSyncFolder = async (): Promise<string | null> => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "選擇備份資料夾" });
      if (!selected || typeof selected !== "string") return null;
      setSyncPath(selected);
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('sync_path', ?)",
        [selected]
      );
      return selected;
    } catch {
      return null;
    }
  };

  // Manual DB export → writes bynalix_backup.db to a fixed location
  // (Android: Documents/Bynalix/database, Desktop: user-picked folder).
  const doExport = async () => {
    let path = syncPath;
    if (os === "android") {
      const { getAndroidBackupPath } = await import("@/lib/backup");
      path = await getAndroidBackupPath();
    } else if (!path) {
      const picked = await pickSyncFolder();
      if (!picked) return; // user cancelled
      path = picked;
    }

    setSyncing(true);
    setSyncMsg(null);
    try {
      const { backupDb } = await import("@/lib/backup");
      const out = await backupDb(path);
      setSyncPath(path);
      setSyncMsg({
        ok: true,
        text: t("settings.export.done") +
          (os === "android"
            ? "Documents/Bynalix/database/" + out.split("/").pop()
            : out),
      });
    } catch (e: any) {
      setSyncMsg({ ok: false, text: t("settings.export.fail") + (e?.message ?? String(e)) });
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(null), 4000);
  };

const loadPinStatus = async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ key: string; value: string }[]>(
        "SELECT key, value FROM app_settings WHERE key IN ('pin_hash','pin_enabled')"
      );
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      if (map["pin_hash"]) {
        setHasStoredPin(true);
        setCurrentPin(map["pin_hash"]);
        setPinEnabled(map["pin_enabled"] === "1");
      }
    } catch (e) { logError("Settings", e); }
  };

  // Toggle PIN lock on/off — hash is always preserved in DB
  const togglePinEnabled = async (val: boolean) => {
    setPinEnabled(val);
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pin_enabled', ?)",
        [val ? "1" : "0"]
      );
    } catch (e) { logError("Settings", e); }
  };

  const savePin = async () => {
    if (pinInput.length < 1) { setPinError(t("settings.pin.errEmpty")); return; }
    if (pinInput !== pinConfirm) { setPinError(t("settings.pin.errMatch")); return; }
    const pinHash = hashPin(pinInput);
    try {
      const db = await getDb();
      await db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pin_hash', ?)", [pinHash]);
      await db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pin_enabled', '1')");
      setCurrentPin(pinHash); setHasStoredPin(true); setPinEnabled(true);
      setShowPinSetup(false); setPinInput(""); setPinConfirm(""); setPinError("");
    } catch (e) {
      logError("Settings.savePin", e);
      showToast(lang === "zh" ? "儲存失敗，請再試一次" : "Save failed, please try again", "error");
    }
  };

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const buildCsvFiles = async (): Promise<{ name: string; content: string }[]> => {
    if (!profile) return [];
    const db = await getDb();
    const files: { name: string; content: string }[] = [];
    for (const table of EXPORT_TABLES) {
      try {
        const rows = await db.select<Record<string, unknown>[]>(
          `SELECT * FROM ${table} WHERE user_id=?`, [profile.user_id]
        );
        files.push({ name: `${table}.csv`, content: "﻿" + toCSV(rows) });
      } catch {
        try {
          const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${table}`);
          files.push({ name: `${table}.csv`, content: "﻿" + toCSV(rows) });
        } catch (e) { logError("Settings", e); }
      }
    }
    return files;
  };

  const triggerDownload = async (blob: Blob, filename: string): Promise<string> => {
    if (os === "android") {
      const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
      const { homeDir, join } = await import("@tauri-apps/api/path");
      const home   = await homeDir();
      const csvDir = await join(home, "Documents", "Bynalix", "csv");
      await mkdir(csvDir, { recursive: true }).catch(() => {});
      const destPath = await join(csvDir, filename);
      const buf = await blob.arrayBuffer();
      await writeFile(destPath, new Uint8Array(buf));
      return destPath;
    } else {
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      return filename;
    }
  };

  const exportAllCSV = async (password?: string) => {
    if (!profile) return;
    setExporting(true);
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      const files = await buildCsvFiles();
      let destPath: string;
      if (password) {
        const { BlobWriter, ZipWriter, TextReader } = await import("@zip.js/zip.js");
        const writer    = new BlobWriter("application/zip");
        const zipWriter = new ZipWriter(writer, { password, encryptionStrength: 3 });
        for (const f of files) {
          await zipWriter.add(f.name, new TextReader(f.content));
        }
        await zipWriter.close();
        const blob = await writer.getData();
        destPath = await triggerDownload(blob, `Bynálix_export_${dateStr}_enc.zip`);
      } else {
        const zip = new JSZip();
        for (const f of files) zip.file(f.name, f.content);
        const blob = await zip.generateAsync({ type: "blob" });
        destPath = await triggerDownload(blob, `Bynálix_export_${dateStr}.zip`);
      }
      if (os === "android") {
        setSyncMsg({ ok: true, text: (lang === "zh" ? "已儲存至\n" : "Saved to\n") + destPath });
        setTimeout(() => setSyncMsg(null), 5000);
      }
    } catch (e: any) {
      setSyncMsg({ ok: false, text: (lang === "zh" ? "匯出失敗：" : "Export failed: ") + (e?.message ?? String(e)) });
      setTimeout(() => setSyncMsg(null), 5000);
    }
    setExporting(false);
  };

  const handleExportClick = () => {
    if (encryptCsv && pinEnabled) {
      setExportPinInput("");
      setExportPinError("");
      setShowEncryptModal(true);
    } else {
      exportAllCSV();
    }
  };

  const handleEncryptedExport = async () => {
    if (hashPin(exportPinInput) !== currentPin) {
      setExportPinError(t("settings.csv.pinMismatch"));
      return;
    }
    setShowEncryptModal(false);
    await exportAllCSV(exportPinInput);
  };

  // ── DB Import ───────────────────────────────────────────────────────────────

  // Returns "ok" | "encrypted" | "invalid"
  const tryOpenImportDb = async (path: string, key?: string): Promise<"ok" | "encrypted" | "invalid"> => {
    let db: any = null;
    let openPath = path;
    let tempPath: string | null = null;
    try {
      // Android: SQLite cannot open a DB sitting in external shared storage
      // (Scoped Storage blocks the -wal/-shm/journal files it needs). Copy the
      // picked file into internal app storage first, then open that copy.
      if (os === "android") {
        const { readFile, writeFile } = await import("@tauri-apps/plugin-fs");
        const { appConfigDir, join } = await import("@tauri-apps/api/path");
        const cfg = await appConfigDir();
        tempPath = await join(cfg, "bynalix_import_temp.db");
        const bytes = await readFile(path);
        await writeFile(tempPath, bytes);
        openPath = tempPath;
      }
      const { default: Database } = await import("@tauri-apps/plugin-sql");
      db = await Database.load(`sqlite:${openPath}`);
      if (key) {
        await db.execute(`PRAGMA key = '${key.replace(/'/g, "''")}'`);
      }

      // Step 1: check which core tables exist via sqlite_master (never throws)
      const tableRows = (await db.select(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_profile','app_settings')"
      )) as { name: string }[];
      const tables = new Set(tableRows.map((r: any) => r.name));

      // Must at least have user_profile to be a valid Bynalix DB
      if (!tables.has("user_profile")) return "invalid";

      // Step 2: if app_settings exists, verify db_marker (safe now — table confirmed)
      if (tables.has("app_settings")) {
        const markerRows = (await db.select(
          "SELECT value FROM app_settings WHERE key='db_marker'"
        )) as { value: string }[];
        if (markerRows.length > 0 && markerRows[0].value === "9527") return "ok";
      }

      // user_profile exists but marker absent (old backup) — still valid
      return "ok";
    } catch (e: any) {
      console.error("[import] open failed:", e);
      const msg = String(e?.message ?? e).toLowerCase();
      if (msg.includes("not a database") || msg.includes("encrypted") || msg.includes("26")) {
        return "encrypted";
      }
      return "invalid";
    } finally {
      if (db) await db.close().catch(() => {});
      if (tempPath) {
        const { remove } = await import("@tauri-apps/plugin-fs");
        await remove(tempPath).catch(() => {});
      }
    }
  };

  const handleImportFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        title: t("settings.db.btn"),
        filters: [{ name: "Database", extensions: ["db"] }],
      });
      if (!selected || typeof selected !== "string") return;

      setImporting(true);
      setImportMsg(null);
      const result = await tryOpenImportDb(selected);
      setImporting(false);

      if (result === "ok") {
        // Validated (plain) — confirm the destructive overwrite before importing.
        setImportDbPath(selected);
        setImportKey(undefined);
        setShowImportConfirm(true);
      } else if (result === "encrypted") {
        setImportDbPath(selected);
        setImportPinDigits(["", "", "", ""]);
        setImportPinError("");
        setShowImportPinModal(true);
        setTimeout(() => importPinRefs.current[0]?.focus(), 100);
      } else {
        setImportMsg({ ok: false, text: t("settings.db.invalid") });
      }
    } catch {
      setImporting(false);
      setImportMsg({ ok: false, text: t("settings.db.readErr") });
    }
  };

  // Perform the actual destructive import: copy the picked .db into internal
  // storage, then let Rust ATTACH it and replace all live data in one tx.
  const performImport = async () => {
    if (!importDbPath) return;
    setShowImportConfirm(false);
    setImporting(true);
    setImportMsg(null);
    let tempPath: string | null = null;
    try {
      const { readFile, writeFile, remove } = await import("@tauri-apps/plugin-fs");
      const { appConfigDir, join } = await import("@tauri-apps/api/path");
      const cfg = await appConfigDir();
      tempPath = await join(cfg, "bynalix_import_temp.db");
      const bytes = await readFile(importDbPath);
      await writeFile(tempPath, bytes);

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("import_db_replace", { srcPath: tempPath, key: importKey });

      await remove(tempPath).catch(() => {});
      tempPath = null;

      setImportMsg({ ok: true, text: t("settings.db.importDone") });
      // Reload so every store re-reads the freshly replaced database.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      if (tempPath) {
        const { remove } = await import("@tauri-apps/plugin-fs");
        await remove(tempPath).catch(() => {});
      }
      console.error("[import] replace failed:", e);
      setImportMsg({ ok: false, text: t("settings.db.importFail") + (e?.message ?? String(e)) });
    } finally {
      setImporting(false);
    }
  };

  const handleImportPinDigit = (idx: number, val: string) => {
    if (val.includes(" ")) return;
    if (val.length > 1) val = val.slice(-1);
    const next = [...importPinDigits];
    next[idx] = val;
    setImportPinDigits(next);
    setImportPinError("");
    if (val && idx < 3) importPinRefs.current[idx + 1]?.focus();
  };

  const handleImportPinKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !importPinDigits[idx] && idx > 0) {
      importPinRefs.current[idx - 1]?.focus();
    }
    if (e.key === "Enter") confirmImportPin();
  };

  const confirmImportPin = async () => {
    const pin = importPinDigits.join("");
    if (!pin) { setImportPinError(t("settings.pin.errEmpty")); return; }
    const pinHash = hashPin(pin);
    setImporting(true);
    const result = await tryOpenImportDb(importDbPath!, pinHash);
    setImporting(false);
    if (result === "ok") {
      // Verified — carry the key into the destructive-confirm step.
      setShowImportPinModal(false);
      setImportKey(pinHash);
      setShowImportConfirm(true);
    } else if (result === "encrypted") {
      setImportPinError(t("settings.csv.pinMismatch"));
    } else {
      setShowImportPinModal(false);
      setImportMsg({ ok: false, text: t("settings.db.invalid") });
    }
  };

  const performReset = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    setResetMsg(null);
    try {
      const db = await getDb();
      const USER_TABLES = [
        "meal_template_items", "meal_template",
        "meal_log", "water_log",
        "exercise_log",
        "strength_set", "strength_session",
        "running_interval", "running_session",
        "weight_log", "body_composition_log",
        "sleep_log",
        "user_favorites",
        "mode_settings",
        "user_profile",
        "app_settings",
        "_seed_meta",
      ];
      for (const tbl of USER_TABLES) {
        await db.execute(`DELETE FROM ${tbl}`).catch(() => {});
      }
      setResetMsg({ ok: true, text: t("settings.reset.done") });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      setResetMsg({ ok: false, text: t("settings.reset.fail") + (e?.message ?? String(e)) });
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto h-full flex flex-col" {...settingsSwipe}>
      {/* Frozen header + tabs */}
      <div className="flex-shrink-0 px-4 md:px-5 pt-4 md:pt-5 pb-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Settings2 size={24} className="text-[var(--text-on-bg)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-on-bg)]">{t("settings.title")}</h1>
            <p className="text-[var(--text-on-bg-muted)] text-xs mt-0.5">v{APP_VERSION}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="pill-bar mb-4">
          {([
            { key: "general",  labelKey: "settings.tab.general"  },
            { key: "security", labelKey: "settings.tab.security" },
            { key: "data",     labelKey: "settings.tab.data"     },
          ] as const).map(item => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={clsx("flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                tab === item.key ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--text-on-bg-muted)] hover:text-[var(--text-on-bg)]")}>
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable tab content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-5 pb-20 md:pb-5">

      {/* ── General Tab ── */}
      {tab === "general" && (
        <div className="space-y-4">
          {/* App info */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <img src="/icon.png" alt="Bynálix" width={44} height={44}
                style={{ borderRadius: "22%", flexShrink: 0 }} draggable={false} />
              <div>
                <p className="font-bold text-[var(--text-on-surface)]">Bynálix</p>
                <p className="text-xs text-[var(--text-on-surface-muted)]">{t("settings.version")} v{APP_VERSION}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2">
                <span className="text-[var(--text-on-surface-muted)]">{t("settings.platform")}</span>
                <span className="text-[var(--text-on-surface)] font-medium">
                  {os === "android" ? "Android" : os === "windows" ? (lang === "zh" ? "桌面版（Windows）" : "Desktop (Windows)") : (lang === "zh" ? "桌面版（macOS）" : "Desktop (macOS)")}
                </span>
              </div>
            </div>
          </div>

          {/* Language selector */}
          <div className="card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-on-surface)]">{t("settings.language")}</span>
              <div className="flex gap-1 bg-[var(--surface-container)] p-1 rounded-xl">
                {(["zh", "en"] as Lang[]).map(l => (
                  <button key={l} onClick={() => setLang(l)}
                    className={clsx("px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                      lang === l ? "bg-[var(--surface)] text-[var(--text-on-surface)] shadow-sm" : "text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]")}>
                    {t(l === "zh" ? "settings.lang.zh" : "settings.lang.en")}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Security Tab ── */}
      {tab === "security" && (
        <div className="space-y-4">
          <div className="card" data-pin-section>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[var(--text-on-surface)]" />
                <span className="text-sm font-semibold text-[var(--text-on-surface)]">{t("settings.pin.title")}</span>
              </div>
              <button
                onClick={() => {
                  if (pinEnabled) {
                    // Disable: keep hash in DB, just clear the flag
                    togglePinEnabled(false);
                  } else if (hasStoredPin) {
                    // Has stored password: re-enable directly, no setup needed
                    togglePinEnabled(true);
                  } else {
                    // No password yet: open setup dialog
                    setShowPinSetup(true);
                  }
                }}
                className={clsx(
                  "relative w-11 h-6 rounded-full transition-colors",
                  pinEnabled ? "bg-[var(--color-primary)]" : "bg-[var(--surface-container)]"
                )}
              >
                <span className={clsx(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  pinEnabled ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-on-surface-muted)]">
              {pinEnabled ? t("settings.pin.on") : t("settings.pin.off")}
            </p>
          </div>

          {/* Change Password — always visible when a password has been set */}
          {hasStoredPin && (
            <button onClick={() => setShowPinSetup(true)}
              className="w-full py-2.5 rounded-xl border border-[var(--surface-border)] text-sm text-[var(--text-on-surface-sub)] hover:bg-[var(--surface-container)] transition-colors">
              {t("settings.pin.change")}
            </button>
          )}

          {/* App 啟動上鎖開關 */}
          {(() => {
            const needsPin = (os === "windows" || os === "macos") && !pinEnabled;
            return (
              <div className="card">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className={needsPin ? "text-[var(--text-on-surface-muted)] opacity-40" : "text-[var(--text-on-surface)]"} />
                    <span className={clsx("text-sm font-semibold", needsPin ? "text-[var(--text-on-surface-muted)] opacity-40" : "text-[var(--text-on-surface)]")}>
                      {t("settings.startup.title")}
                    </span>
                    {needsPin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-container)] text-[var(--text-on-surface-muted)] border border-[var(--surface-border)]">
                        {t("settings.startup.pinRequired")}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleStartupLockToggle()}
                    disabled={needsPin}
                    className={clsx(
                      "relative w-11 h-6 rounded-full transition-colors",
                      needsPin ? "bg-[var(--surface-container)] opacity-40 cursor-not-allowed" :
                      startupLockEnabled ? "bg-[var(--color-primary)]" : "bg-[var(--surface-container)]"
                    )}
                  >
                    <span className={clsx(
                      "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                      startupLockEnabled ? "translate-x-5" : "translate-x-0"
                    )} />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-on-surface-muted)]">
                  {needsPin
                    ? t("settings.startup.off")
                    : startupLockEnabled
                    ? t("settings.startup.on")
                    : os === "android"
                    ? t("settings.startup.androidHint")
                    : t("settings.startup.off")}
                </p>
              </div>
            );
          })()}

          {/* 啟動鎖警告模態（桌面端） */}
          {showStartupWarning && (os === "windows" || os === "macos") && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-amber-600 flex items-center gap-2">
                  <AlertCircle size={20} />
                  {t("settings.startup.warning.title")}
                </h3>

                <div className="space-y-2 text-xs text-gray-700 bg-amber-50 p-3 rounded-lg border border-amber-100">
                  <p>{t("settings.startup.warning.line1")}</p>
                  <p className="font-semibold">{t("settings.startup.warning.line2")}</p>
                  <p>{t("settings.startup.warning.line3")}</p>
                  <p className="text-amber-600 font-medium pt-1">{t("settings.startup.warning.suggest")}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      await saveStartupLockEnabled(true);
                      setShowStartupWarning(false);
                    }}
                    className="w-full py-2 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 transition-colors">
                    {t("settings.startup.warning.btn2")}
                  </button>

                  <button
                    onClick={() => setShowStartupWarning(false)}
                    className="w-full py-2 rounded-xl border border-[var(--surface-border)] text-[var(--text-on-surface-sub)] text-sm font-medium hover:bg-[var(--surface-container)] transition-colors">
                    {t("settings.startup.warning.btn3")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PIN setup modal */}
          {showPinSetup && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("settings.pin.setup")}</h3>
                  <button onClick={() => { setShowPinSetup(false); setPinInput(""); setPinConfirm(""); setPinError(""); }}
                    className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]"><X size={20} /></button>
                </div>
                <p className="text-xs text-[var(--text-on-surface-muted)]">{t("settings.pin.minLen")}</p>
                <div>
                  <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("settings.pin.new")}</label>
                  <div className="relative">
                    <input className="input-base pr-10" type={showPin ? "text" : "password"}
                      placeholder={t("settings.pin.placeholder")} value={pinInput}
                      maxLength={4}
                      onChange={e => { setPinInput(e.target.value); setPinError(""); }} />
                    <button onClick={() => setShowPin(v => !v)}
                      className="absolute right-3 top-2 text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-on-surface-muted)] mb-1">{t("settings.pin.confirm")}</label>
                  <input className="input-base" type={showPin ? "text" : "password"}
                    placeholder={t("settings.pin.placeholder2")} value={pinConfirm}
                    maxLength={4}
                    onChange={e => { setPinConfirm(e.target.value); setPinError(""); }} />
                </div>
                {pinError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {pinError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setShowPinSetup(false); setPinInput(""); setPinConfirm(""); setPinError(""); }}
                    className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
                  <button onClick={savePin}
                    className="btn-primary flex-1">{t("common.save")}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Data Tab ── */}
      {tab === "data" && (
        <div className="space-y-4">
          {/* CSV Export */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileDown size={16} className="text-[var(--text-on-surface)]" />
                <span className="text-sm font-semibold text-[var(--text-on-surface)]">{t("settings.csv.title")}</span>
              </div>
              {/* Encryption toggle */}
              <div className="flex items-center gap-2">
                <span className={clsx("text-xs", pinEnabled ? "text-[var(--text-on-surface-muted)]" : "text-[var(--text-on-surface-muted)] opacity-40")}>
                  {t("settings.csv.encrypt")}
                </span>
                <button
                  disabled={!pinEnabled}
                  onClick={async () => {
                    const next = !encryptCsv;
                    setEncryptCsv(next);
                    const db = await getDb();
                    await db.execute(
                      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('encrypt_csv', ?)",
                      [next ? "1" : "0"]
                    );
                  }}
                  className={clsx(
                    "relative w-9 h-5 rounded-full transition-colors",
                    !pinEnabled ? "opacity-30 cursor-not-allowed bg-[var(--surface-container)]" :
                    encryptCsv ? "bg-[var(--color-primary)]" : "bg-[var(--surface-container)]"
                  )}
                >
                  <span className={clsx(
                    "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    encryptCsv ? "translate-x-4" : "translate-x-0"
                  )} />
                </button>
              </div>
            </div>
            <p className="text-xs text-[var(--text-on-surface-muted)] mb-3">
              {!pinEnabled
                ? t("settings.csv.encryptNeedPin")
                : encryptCsv
                ? t("settings.csv.encryptHint")
                : t("settings.csv.desc")}
            </p>
            <button onClick={handleExportClick} disabled={exporting || !profile}
              className="btn-primary w-full py-2.5 disabled:opacity-40 flex items-center justify-center gap-2">
              <Download size={16} />
              {exporting ? t("settings.csv.exporting") : t("settings.csv.btn")}
            </button>
          </div>

          {/* Encrypted export password modal */}
          {showEncryptModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("settings.csv.enterPinToExport")}</h3>
                  <button onClick={() => setShowEncryptModal(false)} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                    <X size={20} />
                  </button>
                </div>
                <div className="relative">
                  <input
                    autoFocus
                    type="password"
                    value={exportPinInput}
                    onChange={e => { setExportPinInput(e.target.value); setExportPinError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleEncryptedExport()}
                    placeholder={t("settings.pin.placeholder")}
                    className="input-base"
                  />
                </div>
                {exportPinError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {exportPinError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShowEncryptModal(false)}
                    className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
                  <button onClick={handleEncryptedExport}
                    className="btn-primary flex-1">
                    <Download size={14} className="inline mr-1" />
                    {t("settings.csv.btn")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DB Export */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-[var(--text-on-surface)]" />
              <span className="text-sm font-semibold text-[var(--text-on-surface)]">{t("settings.export.title")}</span>
            </div>
            <p className="text-xs text-[var(--text-on-surface-muted)]">{t("settings.export.desc")}</p>

            {/* Export location */}
            {os === "android" ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-container)] border border-[var(--surface-border)]">
                <FolderOpen size={13} className="text-[var(--text-on-surface-muted)] shrink-0" />
                <p className="text-xs text-[var(--text-on-surface-muted)]">Documents/Bynalix/database</p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--surface-container)] border border-[var(--surface-border)]">
                  <p className="text-xs text-[var(--text-on-surface-muted)] truncate">
                    {syncPath || t("settings.sync.noFolder")}
                  </p>
                </div>
                <button
                  onClick={pickSyncFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--surface-border)] text-xs text-[var(--text-on-surface-sub)] hover:bg-[var(--surface-container)] transition-colors shrink-0">
                  <FolderOpen size={13} />
                  {t("settings.sync.pick")}
                </button>
              </div>
            )}

            {/* Export button */}
            <button
              onClick={doExport}
              disabled={syncing}
              className="btn-primary w-full py-2.5 disabled:opacity-40 flex items-center justify-center gap-2">
              <Download size={16} />
              {syncing ? t("settings.export.exporting") : t("settings.export.btn")}
            </button>

            {syncMsg && (
              <div className={clsx(
                "flex items-start gap-2 p-2.5 rounded-xl text-xs",
                syncMsg.ok
                  ? "bg-green-50 border border-green-100 text-green-700"
                  : "bg-red-50 border border-red-100 text-red-600"
              )}>
                {syncMsg.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <X size={13} className="mt-0.5 shrink-0" />}
                <span className="break-all whitespace-pre-line">{syncMsg.text}</span>
              </div>
            )}
          </div>

          {/* DB Import */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Upload size={16} className="text-[var(--text-on-surface)]" />
              <span className="text-sm font-semibold text-[var(--text-on-surface)]">{t("settings.db.title")}</span>
            </div>
            <p className="text-xs text-[var(--text-on-surface-muted)] mb-3">{t("settings.db.desc")}</p>
            <button onClick={handleImportFile} disabled={importing}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--surface-border)] text-sm text-[var(--text-on-surface-muted)] hover:border-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)] transition-all flex items-center justify-center gap-2 disabled:opacity-40">
              <Database size={16} />
              {importing ? t("settings.db.checking") : t("settings.db.btn")}
            </button>

            {importMsg && (
              <div className={clsx(
                "mt-3 p-3 rounded-xl flex items-start gap-2",
                importMsg.ok ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"
              )}>
                {importMsg.ok
                  ? <Check size={14} className="text-green-600 mt-0.5 shrink-0" />
                  : <X size={14} className="text-red-500 mt-0.5 shrink-0" />}
                <p className={clsx("text-xs", importMsg.ok ? "text-green-700" : "text-red-600")}>
                  {importMsg.text}
                </p>
              </div>
            )}
          </div>

          {/* Encrypted DB — PIN verification modal */}
          {showImportPinModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("settings.db.encryptedTitle")}</h3>
                  <button onClick={() => setShowImportPinModal(false)} className="text-[var(--text-on-surface-muted)] hover:text-[var(--text-on-surface)]">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-on-surface-muted)]">{t("settings.db.encryptedHint")}</p>

                {/* 4-box PIN input — no auto-check, Enter / button to confirm */}
                <div className="flex gap-3 justify-center">
                  {importPinDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={el => { importPinRefs.current[i] = el; }}
                      type="password"
                      inputMode="text"
                      maxLength={1}
                      value={d}
                      onChange={e => handleImportPinDigit(i, e.target.value)}
                      onKeyDown={e => handleImportPinKeyDown(i, e)}
                      className={clsx(
                        "w-12 h-12 rounded-xl text-center text-xl font-bold bg-[var(--surface-container)] text-[var(--text-on-surface)]",
                        "border-2 outline-none transition-all",
                        importPinError
                          ? "border-red-400"
                          : d ? "border-teal-400" : "border-gray-200 focus:border-teal-500"
                      )}
                    />
                  ))}
                </div>

                {importPinError && (
                  <p className="text-xs text-red-500 flex items-center justify-center gap-1">
                    <AlertCircle size={12} /> {importPinError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setShowImportPinModal(false)}
                    className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
                  <button onClick={confirmImportPin} disabled={importing}
                    className="btn-primary flex-1 disabled:opacity-40">
                    {importing ? t("settings.db.checking") : t("common.confirm")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reset all data */}
          <div className="card border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={16} className="text-red-500" />
              <span className="text-sm font-semibold text-red-600">{t("settings.reset.title")}</span>
            </div>
            <p className="text-xs text-[var(--text-on-surface-muted)] mb-3">{t("settings.reset.desc")}</p>
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={resetting}
              className="w-full py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 font-medium hover:bg-red-100 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              <Trash2 size={15} />
              {resetting ? t("settings.reset.resetting") : t("settings.reset.btn")}
            </button>
            {resetMsg && (
              <div className={clsx(
                "mt-3 p-3 rounded-xl flex items-start gap-2",
                resetMsg.ok ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"
              )}>
                {resetMsg.ok
                  ? <Check size={14} className="text-green-600 mt-0.5 shrink-0" />
                  : <X size={14} className="text-red-500 mt-0.5 shrink-0" />}
                <p className={clsx("text-xs", resetMsg.ok ? "text-green-700" : "text-red-600")}>
                  {resetMsg.text}
                </p>
              </div>
            )}
          </div>

          {/* Reset confirmation modal */}
          {showResetConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-red-500 shrink-0" />
                  <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("settings.reset.confirmTitle")}</h3>
                </div>
                <p className="text-sm text-[var(--text-on-surface-muted)] leading-relaxed">{t("settings.reset.confirmWarn")}</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowResetConfirm(false)}
                    className="btn-ghost flex-1 border border-[var(--surface-border)]">{t("common.cancel")}</button>
                  <button onClick={performReset}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-all">
                    {t("settings.reset.btn")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Destructive import confirmation */}
          {showImportConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-red-500 shrink-0" />
                  <h3 className="text-lg font-bold text-[var(--text-on-surface)]">{t("settings.db.confirmTitle")}</h3>
                </div>
                <p className="text-sm text-[var(--text-on-surface-muted)] leading-relaxed">{t("settings.db.confirmWarn")}</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowImportConfirm(false)} disabled={importing}
                    className="btn-ghost flex-1 border border-[var(--surface-border)] disabled:opacity-40">{t("common.cancel")}</button>
                  <button onClick={performImport} disabled={importing}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-all disabled:opacity-40">
                    {importing ? t("settings.db.importing") : t("common.confirm")}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
    </div>
  );
}
