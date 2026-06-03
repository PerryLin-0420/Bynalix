package com.bynalix.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {

  /**
   * Listens for screen-off events and persists the timestamp so Rust can
   * read it later via the `get_last_screen_off` invoke command.
   *
   * ACTION_SCREEN_OFF cannot be registered in the manifest; it must be
   * registered dynamically.  The file is written to app dataDir so that
   * the path matches Tauri's app_config_dir on Android.
   */
  private val screenOffReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_OFF) {
        try {
          File(context.dataDir, "last_screen_off.txt")
            .writeText(System.currentTimeMillis().toString())
        } catch (_: Exception) { /* best-effort */ }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    registerReceiver(screenOffReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF))
  }

  override fun onDestroy() {
    try { unregisterReceiver(screenOffReceiver) } catch (_: Exception) { }
    super.onDestroy()
  }
}
