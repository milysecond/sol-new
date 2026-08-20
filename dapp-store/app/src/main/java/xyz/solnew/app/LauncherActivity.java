/*
 * Copyright 2020 Google Inc. + sol.new deep-link fixes
 */
package xyz.solnew.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

/**
 * TWA launcher with deep-link hardening:
 * - Prefer Intent data URL over default launchUrl (/)
 * - singleTask + onNewIntent so a second link while warm opens the new URL
 * - Note: URL fragments (#…) are not delivered by Android App Links —
 *   web must put secrets in query (e.g. /claim?g=…)
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Warm start with a new VIEW intent — restart so TWA loads the new URL
        setIntent(intent);
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            // Relaunch cleanly with the new deep link
            Intent relaunch = new Intent(this, LauncherActivity.class);
            relaunch.setAction(Intent.ACTION_VIEW);
            relaunch.setData(intent.getData());
            relaunch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(relaunch);
            finish();
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        Intent intent = getIntent();
        if (intent != null) {
            Uri data = intent.getData();
            if (data != null
                    && ("http".equalsIgnoreCase(data.getScheme())
                            || "https".equalsIgnoreCase(data.getScheme()))) {
                // Open the exact deep link (path + query). Fragment never arrives from App Links.
                return data;
            }
        }
        return super.getLaunchingUrl();
    }
}
