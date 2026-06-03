package com.bynalix.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {

  // ── WebView bridge ────────────────────────────────────────────────────────

  /**
   * Injected as window.AndroidBridge so TypeScript can call native Android
   * actions that have no Tauri plugin equivalent (e.g. opening a specific
   * Settings screen that requires an Intent).
   */
  private inner class AndroidBridge {

    /** Open the system Usage Access settings page immediately. */
    @JavascriptInterface
    fun openUsageSettings() {
      runOnUiThread {
        try {
          startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).also {
            it.flags = Intent.FLAG_ACTIVITY_NEW_TASK
          })
        } catch (_: Exception) { /* ignore on unsupported devices */ }
      }
    }

    /**
     * Re-query UsageStatsManager and refresh the cached files.
     * Call this after the user returns from the permission settings screen.
     */
    @JavascriptInterface
    fun refreshScreenStats() {
      writeScreenStats(applicationContext)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /** Refresh stats every time the Activity comes to the foreground so that
   *  data is always fresh after returning from the Settings page. */
  override fun onResume() {
    super.onResume()
    writeScreenStats(applicationContext)
  }

  // ── UsageStats helpers ────────────────────────────────────────────────────

  companion object {

    /**
     * Query the system UsageStatsManager for the most recent
     * SCREEN_NON_INTERACTIVE event (= last screen-off) in the past 24 h
     * and write the results to files in app dataDir so the Rust layer can
     * read them via the `get_last_screen_off` command.
     *
     * Files written:
     *   usage_permission.txt  →  "1" if PACKAGE_USAGE_STATS is granted
     *   last_screen_off.txt   →  epoch-ms of last screen-off (if granted)
     */
    fun writeScreenStats(context: Context) {
      val hasPermission = hasUsagePermission(context)
      File(context.dataDir, "usage_permission.txt")
        .writeText(if (hasPermission) "1" else "0")

      if (!hasPermission) return

      val ts = lastScreenOffMs(context)
      if (ts > 0) {
        File(context.dataDir, "last_screen_off.txt").writeText(ts.toString())
      }
    }

    /**
     * Returns the epoch-ms timestamp of the most recent SCREEN_NON_INTERACTIVE
     * event within the last 24 hours, or 0 if none found.
     */
    private fun lastScreenOffMs(context: Context): Long {
      val mgr = context.getSystemService(Context.USAGE_STATS_SERVICE)
        as UsageStatsManager
      val now = System.currentTimeMillis()
      val events = mgr.queryEvents(now - 24 * 60 * 60_000L, now)
      var latest = 0L
      val ev = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(ev)
        // SCREEN_NON_INTERACTIVE (= 2) fires when the screen turns off
        if (ev.eventType == UsageEvents.Event.SCREEN_NON_INTERACTIVE
          && ev.timeStamp > latest
        ) {
          latest = ev.timeStamp
        }
      }
      return latest
    }

    /** Check whether the PACKAGE_USAGE_STATS AppOp is granted. */
    fun hasUsagePermission(context: Context): Boolean {
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName
        )
      }
      return mode == AppOpsManager.MODE_ALLOWED
    }
  }
}
