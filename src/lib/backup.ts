/**
 * Local DB export utility.
 * Source: {appConfigDir}/bynalix.db  →  {destDir}/bynalix_backup.db
 *
 * Architecture:
 *   - Rust command "vacuum_db_to_internal" handles everything that needs POSIX I/O:
 *       · VACUUM INTO → app_config_dir/bynalix_backup.db   (internal, always OK)
 *       · Desktop only: std::fs::copy → user-selected destDir   (POSIX OK on Desktop)
 *   - JS handles the one thing only the plugin-fs bridge can do on Android:
 *       · readFile(internal) + writeFile(external destDir)
 *
 * Android API 30+ Scoped Storage note:
 *   POSIX open(O_CREAT) on an *existing* file in shared storage (Documents) fails
 *   with EEXIST (os error 17). We therefore remove() the destination first so
 *   writeFile creates it fresh.
 */
import { join } from "@tauri-apps/api/path";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { detectOS } from "@/lib/platform";

function isAndroid(): boolean {
  return detectOS() === "android";
}

/** Local timestamp like 20260527_071202 for unique export filenames. */
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * Export a fresh copy of the live DB to destDir/bynalix_backup.db.
 *
 * Rust runs VACUUM INTO an internal temp file + atomic rename (always reliable),
 * and on Desktop also copies to destDir. On Android we then push the internal
 * copy to external storage via plugin-fs, deleting any existing file first.
 *
 * Returns the user-accessible path of the exported file.
 */
export async function backupDb(destDir: string): Promise<string> {
  // Rust: VACUUM INTO internal (+ Desktop copy to destDir).
  // Returns internal path on Android, destDir path on Desktop.
  const rustPath = await invoke<string>("vacuum_db_to_internal", { destDir });

  if (isAndroid()) {
    // Use a unique timestamped filename — Android Scoped Storage keeps a
    // MediaStore "ghost" index of any filename ever written here, and POSIX
    // open(O_CREAT) on that name fails with EEXIST (os error 17) even after
    // remove() and even when the folder looks empty. A fresh name never
    // collides — this is exactly why CSV export (date-stamped names) works.
    const externalPath = await join(destDir, `bynalix_backup_${timestamp()}.db`);
    const data = await readFile(rustPath);
    await writeFile(externalPath, data);
    return externalPath;
  }

  // Desktop: Rust already delivered the file to destDir.
  return rustPath;
}

/** Fixed export dir for Android — Documents/Bynalix/database. */
export async function getAndroidBackupPath(): Promise<string> {
  const { homeDir, join: joinPath } = await import("@tauri-apps/api/path");
  const home  = await homeDir();
  const dbDir = await joinPath(home, "Documents", "Bynalix", "database");
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  await mkdir(dbDir, { recursive: true }).catch(() => {});
  return dbDir;
}
