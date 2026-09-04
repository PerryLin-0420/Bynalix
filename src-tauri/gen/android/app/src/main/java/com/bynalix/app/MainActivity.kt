package com.bynalix.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Process
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.annotation.RequiresApi
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

    /**
     * Save a chart image so the system gallery can actually find it.
     *
     * Writing a file into a public folder is not enough: gallery apps read
     * MediaStore, not the filesystem, so a plain file write leaves the image
     * invisible until something else happens to trigger a scan. This inserts
     * the image through MediaStore itself (API 29+), or writes it and asks the
     * media scanner to pick it up (older releases).
     *
     * @param base64Jpeg the JPEG bytes, base64-encoded
     * @param displayName the filename to show in the gallery
     * @return "ok" on success, or "err: <reason>" — the caller falls back to a
     *         plain Documents write rather than losing the export.
     */
    @JavascriptInterface
    fun saveImageToGallery(base64Jpeg: String, displayName: String): String {
      return try {
        val bytes = Base64.decode(base64Jpeg, Base64.DEFAULT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          insertViaMediaStore(applicationContext, bytes, displayName)
        } else {
          writeAndScan(applicationContext, bytes, displayName)
        }
        "ok"
      } catch (e: Exception) {
        "err: " + (e.message ?: e.javaClass.simpleName)
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
  }

  // ── UsageStats helpers ────────────────────────────────────────────────────

  companion object {

    /** Gallery album the exported charts land in. */
    private const val ALBUM = "Bynalix"

    /**
     * API 29+: hand the bytes to MediaStore and let it own the file.
     *
     * IS_PENDING keeps the entry hidden while it is being written, so a gallery
     * app scanning mid-write never shows a half-decoded image; clearing it is
     * what publishes the picture.
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun insertViaMediaStore(context: Context, bytes: ByteArray, displayName: String) {
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(
          MediaStore.Images.Media.RELATIVE_PATH,
          Environment.DIRECTORY_PICTURES + File.separator + ALBUM,
        )
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }

      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("MediaStore refused the insert")
      try {
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
          ?: throw IllegalStateException("no output stream for $uri")
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
      } catch (e: Exception) {
        // Leaving a pending row behind would show up as a permanently
        // invisible, undeletable entry, so drop it before rethrowing.
        resolver.delete(uri, null, null)
        throw e
      }
    }

    /**
     * Pre-29: write into the public Pictures folder, then tell the media
     * scanner about it — without that call the file exists but no gallery app
     * knows it does. Needs WRITE_EXTERNAL_STORAGE to have been granted; if it
     * has not, this throws and the caller falls back.
     */
    private fun writeAndScan(context: Context, bytes: ByteArray, displayName: String) {
      @Suppress("DEPRECATION")
      val dir = File(
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
        ALBUM,
      )
      if (!dir.exists() && !dir.mkdirs()) throw IllegalStateException("cannot create $dir")
      val file = File(dir, displayName)
      file.writeBytes(bytes)
      MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/jpeg"), null)
    }

    /** Minimum length of a screen-off gap to be treated as sleep (3 h). */
    private const val MIN_SLEEP_MS = 3 * 60 * 60_000L

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
