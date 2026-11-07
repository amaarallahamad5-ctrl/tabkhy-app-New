package com.bayti.home;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * بيتي — a single, fully offline screen.
 *
 * Security design:
 *  - The app has NO permissions (no Internet, no storage, no camera, nothing).
 *  - The whole app is bundled in the APK (assets/) and served from a private https origin
 *    that never touches the network. Every other address is blocked.
 *  - WebView file/content access is disabled, debugging is off, pop-ups are blocked,
 *    and any web permission request (camera, mic, location) is automatically denied.
 *  - The JavaScript bridge only exposes 5 harmless actions: share text, save a backup or
 *    a CSV report to a place the user picks (system "Save as" screen — the app can't touch
 *    any other file), a tiny vibration, and switching the status-bar colours for dark mode.
 *    Only our own bundled page can use it.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    private static final int REQ_OPEN_FILE = 41;
    private static final int REQ_SAVE_FILE = 42;
    private static final int MAX_BACKUP_CHARS = 20 * 1024 * 1024;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackup;
    private String pendingDoneMsg = "تم حفظ النسخة الاحتياطية ✓";
    private volatile boolean dark = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        styleSystemBars();

        WebView.setWebContentsDebuggingEnabled(false);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F6F3EE"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);               // localStorage = the user's saved data
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);

        web.setWebViewClient(new LocalOnlyClient());
        web.setWebChromeClient(new SafeChromeClient());
        web.addJavascriptInterface(new Bridge(), "BaytiAndroid");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME);
    }

    private int bgColor() { return Color.parseColor(dark ? "#161B1A" : "#F6F3EE"); }

    @SuppressWarnings("deprecation")
    private void styleSystemBars() {
        Window w = getWindow();
        w.setStatusBarColor(bgColor());
        int flags = 0;
        if (Build.VERSION.SDK_INT >= 23 && !dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 27) {
            w.setNavigationBarColor(dark ? Color.parseColor("#212826") : Color.WHITE);
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        if (Build.VERSION.SDK_INT >= 23) w.getDecorView().setSystemUiVisibility(flags);
        if (web != null) web.setBackgroundColor(bgColor());
    }

    /* ---------------- serve bundled files only ---------------- */
    private class LocalOnlyClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return blocked();
            String path = u.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            if (path.contains("..")) return blocked();
            try {
                InputStream in = getAssets().open(path.substring(1));
                Map<String, String> h = new HashMap<>();
                h.put("Content-Security-Policy",
                        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
                        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; " +
                        "frame-src 'none'; base-uri 'none'; form-action 'none'");
                h.put("X-Content-Type-Options", "nosniff");
                h.put("Cache-Control", "no-store");
                return new WebResourceResponse(mime(path), "utf-8", 200, "OK", h, in);
            } catch (Exception e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            // Stay inside the app. Never open outside websites.
            return !("https".equals(u.getScheme()) && HOST.equals(u.getHost()));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (Build.VERSION.SDK_INT >= 23 && view != null) view.setBackgroundColor(bgColor());
        }
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", new HashMap<String, String>(),
                new ByteArrayInputStream(new byte[0]));
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(),
                new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /* ---------------- dialogs, file picker, permissions ---------------- */
    private class SafeChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
            try {
                startActivityForResult(i, REQ_OPEN_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) { request.deny(); }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            cb.invoke(origin, false, false);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_OPEN_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            String json = pendingBackup;
            pendingBackup = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || json == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (out == null) throw new Exception("no stream");
                out.write(json.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, pendingDoneMsg, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "تعذّر حفظ الملف", Toast.LENGTH_SHORT).show();
            }
        }
    }

    /* ---------------- tiny, safe bridge for the page ---------------- */
    private class Bridge {
        @JavascriptInterface
        public void shareText(final String text) {
            if (text == null || text.length() > 20000) return;
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                try { startActivity(Intent.createChooser(send, "مشاركة القائمة")); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void saveBackup(final String json, final String fileName) {
            if (json == null || json.length() > MAX_BACKUP_CHARS) return;
            final String name = (fileName != null && fileName.matches("[A-Za-z0-9._-]{1,80}")) ? fileName : "bayti-backup.json";
            runOnUiThread(() -> {
                pendingBackup = json;
                pendingDoneMsg = "تم حفظ النسخة الاحتياطية ✓";
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_SAVE_FILE); } catch (Exception e) { pendingBackup = null; }
            });
        }

        /** Save a CSV report or JSON file through the system "Save as" screen (user picks the place). */
        @JavascriptInterface
        public void saveFile(final String content, final String fileName, final String mimeType) {
            if (content == null || content.length() > MAX_BACKUP_CHARS) return;
            final boolean csv = "text/csv".equals(mimeType);
            final boolean json = "application/json".equals(mimeType);
            if (!csv && !json) return;                                   // only these two types, nothing else
            final String ext = csv ? ".csv" : ".json";
            final String name = (fileName != null && fileName.matches("[A-Za-z0-9._-]{1,80}") && fileName.endsWith(ext))
                    ? fileName : ("bayti" + ext);
            runOnUiThread(() -> {
                pendingBackup = content;
                pendingDoneMsg = csv ? "تم حفظ التقرير ✓" : "تم حفظ الملف ✓";
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mimeType);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_SAVE_FILE); } catch (Exception e) { pendingBackup = null; }
            });
        }

        /** Match the phone's status / navigation bars to the app's light or dark look. */
        @JavascriptInterface
        public void setDark(final boolean on) {
            runOnUiThread(() -> { dark = on; styleSystemBars(); });
        }

        @JavascriptInterface
        public void haptic(final int strong) {
            runOnUiThread(() -> {
                if (web != null) web.performHapticFeedback(strong > 0 ? HapticFeedbackConstants.VIRTUAL_KEY : HapticFeedbackConstants.KEYBOARD_TAP);
            });
        }

        /** Opens the phone's dialer with the number pre-filled. The user still has to press call,
         *  so no CALL_PHONE permission is needed. Only digits and a leading + are passed through. */
        @JavascriptInterface
        public void dial(final String number) {
            if (number == null) return;
            final String n = number.replaceAll("[^0-9+]", "");
            if (n.isEmpty() || n.length() > 20) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + n))); }
                catch (Exception e) { Toast.makeText(MainActivity.this, n, Toast.LENGTH_LONG).show(); }
            });
        }

        /** Keeps the screen on while cooking mode is open (window flag only, no permission). */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }

    /* ---------------- lifecycle ---------------- */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        // Let the page close an open sheet or go back to the home tab first.
        web.evaluateJavascript("(window.baytiBack && window.baytiBack()) ? 'y' : 'n'", v -> {
            if (v == null || !v.contains("y")) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'))", null);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("BaytiAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
