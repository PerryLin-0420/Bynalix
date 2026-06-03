use tauri::Manager;
use sqlx::{Connection, Row};
use std::collections::HashSet;

/// Create a fresh backup of the live DB using VACUUM INTO (internal storage).
///
/// Android — Scoped Storage means Rust std::fs cannot write to external storage.
///   This command writes to app_config_dir/bynalix_backup.db (internal, POSIX OK)
///   and returns that path. The JS caller then does readFile+writeFile to push a
///   copy to external storage via the plugin-fs Java bridge.
///
/// Desktop — No Scoped Storage restriction. After VACUUM INTO to the internal path,
///   this command does a plain std::fs::copy to the user-selected dest_dir and
///   returns the final external path directly (JS needs no further action).
#[tauri::command]
async fn vacuum_db_to_internal(
    app: tauri::AppHandle,
    dest_dir: String,
) -> Result<String, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;

    // tauri-plugin-sql stores the DB in app_config_dir with the filename from the
    // connection string ("sqlite:bynalix.db" → app_config_dir/bynalix.db).
    let src_path = config_dir.join("bynalix.db");
    let internal_path = config_dir.join("bynalix_backup.db");
    let tmp_path = config_dir.join("bynalix_backup.tmp.db");
    let internal_str = internal_path
        .to_str()
        .ok_or("internal path is not valid UTF-8")?
        .to_string();
    let tmp_str = tmp_path
        .to_str()
        .ok_or("tmp path is not valid UTF-8")?
        .to_string();

    // VACUUM INTO requires the destination to NOT exist, and refuses to overwrite
    // (→ "File exists (os error 17)"). The final backup file may be held open by a
    // live dual-write connection, so we cannot reliably delete it in place.
    //
    // Solution: VACUUM INTO a private temp file (which we fully control and clear
    // first), then atomically rename it over the final path. rename() on Linux/
    // Android replaces the destination unconditionally — even if it exists or is
    // currently open — so EEXIST is impossible.
    let _ = std::fs::remove_file(&tmp_path);
    let _ = std::fs::remove_file(format!("{tmp_str}-wal"));
    let _ = std::fs::remove_file(format!("{tmp_str}-shm"));

    // Open a read connection to the live DB and run VACUUM INTO the temp file.
    // SQLite WAL mode supports concurrent readers; VACUUM INTO produces a
    // consistent snapshot that includes all committed WAL data.
    let src_url = format!(
        "sqlite:{}",
        src_path
            .to_str()
            .ok_or("src path is not valid UTF-8")?
    );
    let pool = sqlx::sqlite::SqlitePool::connect(&src_url)
        .await
        .map_err(|e| format!("open src DB: {e}"))?;

    let tmp_escaped = tmp_str.replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{tmp_escaped}'"))
        .execute(&pool)
        .await
        .map_err(|e| format!("VACUUM INTO: {e}"))?;

    pool.close().await;

    // Clear any stale WAL/SHM beside the final path (a fresh VACUUM copy has none),
    // then atomically replace the final backup with the freshly-vacuumed temp file.
    let _ = std::fs::remove_file(format!("{internal_str}-wal"));
    let _ = std::fs::remove_file(format!("{internal_str}-shm"));
    std::fs::rename(&tmp_path, &internal_path)
        .map_err(|e| format!("rename tmp → backup: {e}"))?;

    // Desktop: std::fs::copy works everywhere — copy to the user-chosen dir and
    // return the final path so JS has nothing more to do.
    #[cfg(not(target_os = "android"))]
    {
        let dest_path = std::path::PathBuf::from(&dest_dir).join("bynalix_backup.db");
        std::fs::copy(&internal_path, &dest_path)
            .map_err(|e| format!("copy to dest_dir: {e}"))?;
        return dest_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "dest path is not valid UTF-8".to_string());
    }

    // Android: return internal path; JS will readFile+writeFile to external.
    #[cfg(target_os = "android")]
    Ok(internal_str)
}

/// Replace ALL data in the live DB with the data from an imported DB file.
///
/// `src_path` MUST be an internal-storage path (the JS caller copies the
/// user-picked .db into app_config_dir first — sqlx cannot open files in
/// Android external/shared storage).
///
/// Strategy — done on a SINGLE dedicated connection so ATTACH + the wrapping
/// transaction are guaranteed to share one SQLite session (a plugin-sql pool
/// would scatter these across connections and silently break atomicity):
///   1. ATTACH the imported DB as `imp`.
///   2. For every user table in the live DB: DELETE all rows, then copy rows
///      from `imp` using the INTERSECTION of column names (matched by name,
///      never by position) — this is robust against schema-order drift between
///      a fresh-install DB and an older migrated DB. Columns missing on either
///      side are simply skipped and keep their defaults.
///   3. All wrapped in one transaction: any failure rolls back to the original
///      data, so a failed import never leaves a half-wiped DB.
#[tauri::command]
async fn import_db_replace(
    app: tauri::AppHandle,
    src_path: String,
    key: Option<String>,
) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let live_path = config_dir.join("bynalix.db");
    let live_url = format!(
        "sqlite:{}",
        live_path.to_str().ok_or("live path is not valid UTF-8")?
    );

    let mut conn = sqlx::sqlite::SqliteConnection::connect(&live_url)
        .await
        .map_err(|e| format!("open live DB: {e}"))?;

    // Wait up to 5s for the live plugin-sql pool to release any write lock
    // instead of failing immediately with SQLITE_BUSY.
    let _ = sqlx::query("PRAGMA busy_timeout = 5000")
        .execute(&mut conn)
        .await;

    let src_escaped = src_path.replace('\'', "''");
    // KEY clause is only emitted for encrypted imports (SQLCipher builds).
    // Plain SQLite ATTACH has no KEY clause (that is a SQLCipher extension);
    // only emit KEY for encrypted imports.
    let attach = match &key {
        Some(k) => {
            let k_esc = k.replace('\'', "''");
            format!("ATTACH DATABASE '{src_escaped}' AS imp KEY '{k_esc}'")
        }
        None => format!("ATTACH DATABASE '{src_escaped}' AS imp"),
    };
    sqlx::query(&attach)
        .execute(&mut conn)
        .await
        .map_err(|e| format!("ATTACH import DB: {e}"))?;

    // Run the destructive copy inside a transaction; roll back on any error.
    let result = copy_all_tables(&mut conn).await;

    if let Err(ref e) = result {
        let _ = sqlx::query("ROLLBACK").execute(&mut conn).await;
        let _ = sqlx::query("DETACH DATABASE imp").execute(&mut conn).await;
        let _ = sqlx::query("PRAGMA foreign_keys = ON").execute(&mut conn).await;
        let _ = conn.close().await;
        return Err(format!("import failed (rolled back): {e}"));
    }

    let _ = sqlx::query("DETACH DATABASE imp").execute(&mut conn).await;
    let _ = sqlx::query("PRAGMA foreign_keys = ON").execute(&mut conn).await;
    let _ = conn.close().await;
    Ok(())
}

/// Helper: wipe each live table and refill it from `imp` by column-name match.
/// FK enforcement is disabled for the wipe/refill so table order does not matter.
async fn copy_all_tables(conn: &mut sqlx::sqlite::SqliteConnection) -> Result<(), String> {
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("disable FK: {e}"))?;

    sqlx::query("BEGIN")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("begin tx: {e}"))?;

    let main_tables = list_tables(&mut *conn, "main").await?;
    let imp_tables: HashSet<String> =
        list_tables(&mut *conn, "imp").await?.into_iter().collect();

    for t in &main_tables {
        sqlx::query(&format!("DELETE FROM main.\"{t}\""))
            .execute(&mut *conn)
            .await
            .map_err(|e| format!("clear {t}: {e}"))?;

        if !imp_tables.contains(t) {
            continue; // table absent in import (older backup) — leave it empty
        }

        let main_cols = table_columns(&mut *conn, "main", t).await?;
        let imp_cols: HashSet<String> =
            table_columns(&mut *conn, "imp", t).await?.into_iter().collect();
        let common: Vec<&String> = main_cols.iter().filter(|c| imp_cols.contains(*c)).collect();

        if common.is_empty() {
            continue;
        }
        let col_list = common
            .iter()
            .map(|c| format!("\"{c}\""))
            .collect::<Vec<_>>()
            .join(", ");
        sqlx::query(&format!(
            "INSERT INTO main.\"{t}\" ({col_list}) SELECT {col_list} FROM imp.\"{t}\""
        ))
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("copy {t}: {e}"))?;
    }

    sqlx::query("COMMIT")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("commit tx: {e}"))?;
    Ok(())
}

/// User tables in a schema (excludes sqlite internal tables).
async fn list_tables(
    conn: &mut sqlx::sqlite::SqliteConnection,
    schema: &str,
) -> Result<Vec<String>, String> {
    let rows = sqlx::query(&format!(
        "SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ))
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| format!("list {schema} tables: {e}"))?;
    rows.into_iter()
        .map(|r| r.try_get::<String, _>("name").map_err(|e| e.to_string()))
        .collect()
}

/// Column names of a table via PRAGMA table_info.
async fn table_columns(
    conn: &mut sqlx::sqlite::SqliteConnection,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    let esc = table.replace('\'', "''");
    let rows = sqlx::query(&format!("PRAGMA {schema}.table_info('{esc}')"))
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| format!("table_info {schema}.{table}: {e}"))?;
    rows.into_iter()
        .map(|r| r.try_get::<String, _>("name").map_err(|e| e.to_string()))
        .collect()
}

/// Return the epoch-milliseconds timestamp of the last screen-off event
/// recorded by the Android BroadcastReceiver in MainActivity.
///
/// On Android, MainActivity writes `app_config_dir/last_screen_off.txt`
/// (a plain integer string) whenever ACTION_SCREEN_OFF fires.
/// On all other platforms, or when the file has not been written yet,
/// this returns -1.
#[tauri::command]
async fn get_last_screen_off(app: tauri::AppHandle) -> Result<i64, String> {
    let data_dir = match app.path().app_config_dir() {
        Ok(d) => d,
        Err(_) => return Ok(-1),
    };
    let file = data_dir.join("last_screen_off.txt");
    if !file.exists() {
        return Ok(-1);
    }
    let content = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
    content.trim().parse::<i64>().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            vacuum_db_to_internal,
            import_db_replace,
            get_last_screen_off,
        ])
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init());

    // tauri-plugin-biometric has #![cfg(mobile)] — only register on mobile targets.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
