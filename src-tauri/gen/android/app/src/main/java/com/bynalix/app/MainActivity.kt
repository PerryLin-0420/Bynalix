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
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

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

    /** Re-read walking sessions from Health Connect. */
    @JavascriptInterface
    fun refreshWalkStats() {
      writeWalkStats(applicationContext)
    }

    /**
     * Open Health Connect so the user can grant read access (or install it, on
     * releases where it is not part of the platform). Permissions for Health
     * Connect are managed inside that app rather than by a runtime dialog.
     */
    @JavascriptInterface
    fun openHealthConnect() {
      runOnUiThread {
        try {
          val settings = Intent(HEALTH_CONNECT_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
          if (settings.resolveActivity(packageManager) != null) {
            startActivity(settings)
            return@runOnUiThread
          }
          // Not installed — send the user to the store listing instead.
          startActivity(Intent(Intent.ACTION_VIEW).apply {
            data = android.net.Uri.parse(
              "market://details?id=$HEALTH_CONNECT_PACKAGE"
            )
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          })
        } catch (_: Exception) { /* ignore on unsupported devices */ }
      }
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
    writeWalkStats(applicationContext)
  }

  // ── UsageStats helpers ────────────────────────────────────────────────────

  companion object {

    /** Minimum length of a screen-off gap to be treated as sleep (3 h). */
    private const val MIN_SLEEP_MS = 3 * 60 * 60_000L

    const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"
    const val HEALTH_CONNECT_SETTINGS = "androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"

    /** How far back to pull walking history, matching the stats range. */
    private const val WALK_HISTORY_DAYS = 90L

    /**
     * Pull per-day walking minutes out of Health Connect.
     *
     * Health Connect is the on-device store that apps like Samsung Health and
     * Google Fit publish into, which is where a figure such as "walking time
     * today" actually comes from — no Android sensor reports walking duration
     * on its own. Because the records carry real start/end instants, daily
     * totals are computed directly here and need none of the snapshot-and-diff
     * bookkeeping a cumulative counter would require.
     *
     * Sessions that straddle midnight are split at the local day boundary so
     * each day gets only the minutes that actually fall inside it.
     *
     * Files written:
     *   walk_status.txt →  "unavailable" | "no_permission" | "ok"
     *   walk_days.json  →  [{"date":"YYYY-MM-DD","min":42.5}, ...]
     */
    fun writeWalkStats(context: Context) {
      val statusFile = File(context.dataDir, "walk_status.txt")
      if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
        statusFile.writeText("unavailable")
        return
      }

      val client = try {
        HealthConnectClient.getOrCreate(context)
      } catch (_: Throwable) {
        statusFile.writeText("unavailable"); return
      }

      CoroutineScope(Dispatchers.IO).launch {
        try {
          val needed = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
          if (!client.permissionController.getGrantedPermissions().contains(needed)) {
            statusFile.writeText("no_permission")
            return@launch
          }

          val zone = ZoneId.systemDefault()
          val end = Instant.now()
          val start = end.minus(Duration.ofDays(WALK_HISTORY_DAYS))
          val records = client.readRecords(
            ReadRecordsRequest(
              recordType = ExerciseSessionRecord::class,
              timeRangeFilter = TimeRangeFilter.between(start, end),
            )
          ).records

          val perDay = sortedMapOf<String, Double>()
          for (rec in records) {
            if (rec.exerciseType != ExerciseSessionRecord.EXERCISE_TYPE_WALKING &&
              rec.exerciseType != ExerciseSessionRecord.EXERCISE_TYPE_HIKING
            ) continue
            // Clip the session to each local day it overlaps.
            var cursor = rec.startTime
            while (cursor.isBefore(rec.endTime)) {
              val day = cursor.atZone(zone).toLocalDate()
              val dayEnd = day.plusDays(1).atStartOfDay(zone).toInstant()
              val segEnd = if (dayEnd.isBefore(rec.endTime)) dayEnd else rec.endTime
              val mins = Duration.between(cursor, segEnd).toMillis() / 60_000.0
              if (mins > 0) perDay[day.toString()] = (perDay[day.toString()] ?: 0.0) + mins
              cursor = segEnd
            }
          }

          // Locale.US is required: the default locale would render decimals
          // with a comma on many devices, producing invalid JSON.
          val json = perDay.entries.joinToString(",", "[", "]") {
            """{"date":"${it.key}","min":${String.format(Locale.US, "%.1f", it.value)}}"""
          }
          File(context.dataDir, "walk_days.json").writeText(json)
          statusFile.writeText("ok")
        } catch (_: Throwable) {
          statusFile.writeText("unavailable")
        }
      }
    }

    /**
     * Detect the user's most recent sleep window from the past 24 h of screen
     * on/off events and write the results to files in app dataDir so the Rust
     * layer can read them via the `get_last_screen_off` command.
     *
     * Files written:
     *   usage_permission.txt  →  "1" if PACKAGE_USAGE_STATS is granted
     *   sleep_start.txt       →  epoch-ms the user fell asleep  (if granted)
     *   wake_time.txt         →  epoch-ms the user woke up      (if granted)
     */
    fun writeScreenStats(context: Context) {
      val hasPermission = hasUsagePermission(context)
      File(context.dataDir, "usage_permission.txt")
        .writeText(if (hasPermission) "1" else "0")

      if (!hasPermission) return

      val window = longestScreenOffWindow(context)
      if (window != null) {
        File(context.dataDir, "sleep_start.txt").writeText(window.first.toString())
        File(context.dataDir, "wake_time.txt").writeText(window.second.toString())
      }
    }

    /**
     * Scan the last 24 h of screen on/off events and return the longest
     * continuous screen-off interval as (start, end) epoch-ms — i.e. the most
     * likely (fell-asleep, woke-up) pair. Returns null if no interval is at
     * least [MIN_SLEEP_MS] long.
     *
     * Using the *longest* gap (rather than the single most-recent screen-off)
     * is what makes detection robust to morning phone use before the sleep is
     * logged: turning the screen on to dismiss the alarm ends the overnight gap
     * exactly at wake-up, and any subsequent morning check-in starts a new,
     * short gap that never beats it. So both the sleep-start and the wake-up
     * timestamps stay anchored to the real sleep, independent of when the user
     * actually opens the app to log it.
     */
    private fun longestScreenOffWindow(context: Context): Pair<Long, Long>? {
      val mgr = context.getSystemService(Context.USAGE_STATS_SERVICE)
        as UsageStatsManager
      val now = System.currentTimeMillis()
      val events = mgr.queryEvents(now - 24 * 60 * 60_000L, now)

      var offStart = -1L
      var bestStart = -1L
      var bestEnd = -1L
      var bestDur = 0L
      val ev = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(ev)
        when (ev.eventType) {
          // Screen off → open an off-interval (keep the earliest edge when
          // several non-interactive events fire before any screen-on).
          UsageEvents.Event.SCREEN_NON_INTERACTIVE ->
            if (offStart < 0) offStart = ev.timeStamp
          // Screen on → close the current off-interval, remember the longest.
          UsageEvents.Event.SCREEN_INTERACTIVE ->
            if (offStart >= 0) {
              val dur = ev.timeStamp - offStart
              if (dur > bestDur) { bestDur = dur; bestStart = offStart; bestEnd = ev.timeStamp }
              offStart = -1L
            }
        }
      }
      // Screen still off at query time (app opened straight from sleep before
      // the wake event is flushed): treat "now" as the wake edge.
      if (offStart >= 0) {
        val dur = now - offStart
        if (dur > bestDur) { bestDur = dur; bestStart = offStart; bestEnd = now }
      }

      return if (bestStart >= 0 && bestDur >= MIN_SLEEP_MS) Pair(bestStart, bestEnd) else null
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
