package com.smartcanteen.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Razorpay checkout needs a second window; a stock WebView refuses to open one.
 *
 * The hosted checkout hands the shopper off to their bank or UPI app by calling
 * window.open(). In a browser that is a new tab. In an Android WebView,
 * window.open() is a no-op unless the app explicitly opts in AND supplies a
 * WebView for the popup to live in — so checkout loaded, the bank list rendered,
 * and selecting a bank did nothing except report "Payment could not be
 * completed". The same build works on the website because a browser has tabs.
 *
 * Two pieces are required and neither works alone:
 *   1. setSupportMultipleWindows(true) — permits the request at all.
 *   2. onCreateWindow — actually creates the child WebView. Returning false
 *      here (the default) silently drops the request, which is precisely the
 *      failure that looked like a payment-gateway problem.
 *
 * The child is closed by onCloseWindow, which is how the shopper gets returned
 * to the app after paying rather than being stranded on the bank's "done" page.
 */
public class MainActivity extends BridgeActivity {

    private WebView popupWebView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView main = getBridge().getWebView();
        WebSettings settings = main.getSettings();

        // Remote debugging for debug builds only. Without this there is no way
        // to see a console error from inside the app — a payment failure looks
        // identical whether the gateway rejected it, a script failed to load,
        // or a popup was blocked. With it, chrome://inspect on a connected
        // machine shows the real console and network activity.
        //
        // Gated on the debuggable flag so release builds never expose their
        // WebView to anything plugged into the phone.
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // ── Why UPI / GPay / QR were missing from checkout ───────────────────
        // Android's WebView appends a "wv" token to its user agent. Razorpay's
        // checkout reads that, concludes it is inside a WebView, and hides the
        // UPI intent methods — because in a stock WebView they cannot work:
        // tapping GPay produces a upi:// URL the WebView has no idea how to
        // open. The methods were not missing from the account; checkout chose
        // not to offer them.
        //
        // Dropping just that token, rather than replacing the whole string,
        // keeps the real Chrome version, Android version and device model
        // intact, so nothing else that sniffs the agent is misled.
        //
        // On its own this would be dishonest — it would advertise a capability
        // the app lacks — so it is paired with the scheme handling below, which
        // supplies the capability. Neither half is any use alone.
        String ua = settings.getUserAgentString();
        if (ua != null) {
            settings.setUserAgentString(ua.replace("; wv", "").replace(" wv", ""));
        }

        // Give checkout somewhere to send upi:// and intent:// URLs. Without
        // this the WebView fails them as ERR_UNKNOWN_URL_SCHEME and the handoff
        // to the payment app dies silently.
        //
        // Extends Capacitor's own client rather than replacing it: the bridge
        // lives in shouldOverrideUrlLoading, and a bare WebViewClient here
        // would cut the JavaScript layer off from the native one and break the
        // entire app, not just payments.
        main.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isExternalScheme(url) && launchExternalApp(url)) return true;
                return super.shouldOverrideUrlLoading(view, request);
            }
        });

        // Permit the popup request. JavaScript itself is already enabled by
        // Capacitor; without this flag the call is rejected before any listener
        // is consulted.
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        // Bank and UPI pages are third-party and set cookies on their own
        // domains during the redirect chain.
        settings.setDomStorageEnabled(true);

        main.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                popupWebView = new WebView(view.getContext());
                WebSettings ps = popupWebView.getSettings();
                ps.setJavaScriptEnabled(true);
                ps.setDomStorageEnabled(true);
                ps.setSupportMultipleWindows(true);
                ps.setJavaScriptCanOpenWindowsAutomatically(true);
                // Some bank pages serve a desktop layout to the default WebView
                // UA and become unusable on a phone.
                ps.setUseWideViewPort(true);
                ps.setLoadWithOverviewMode(true);
                ps.setBuiltInZoomControls(true);
                ps.setDisplayZoomControls(false);

                // Keep https navigation inside this WebView — handing bank URLs
                // to an external browser breaks the return trip, because the
                // payment result would land in Chrome and never reach
                // checkout's handler. But upi:// and intent:// are exactly the
                // URLs that MUST leave, since they address another app.
                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        return isExternalScheme(url) && launchExternalApp(url);
                    }
                });
                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        removePopup();
                    }
                });

                popupWebView.setLayoutParams(new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                addContentView(popupWebView, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                // Hand the new WebView back to the engine that asked for it —
                // this is what actually completes window.open().
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                removePopup();
            }
        });
    }

    /**
     * True for URLs addressed to another app rather than to the web.
     *
     * upi: is the generic UPI intent every payment app registers. tez: (Google
     * Pay's original name), phonepe: and paytmmp: are app-specific schemes
     * checkout uses when it knows which app was chosen. intent: is Android's
     * own encoding, which carries a fallback URL for when the app is absent.
     */
    private static boolean isExternalScheme(String url) {
        return url.startsWith("upi:")
            || url.startsWith("intent:")
            || url.startsWith("tez:")
            || url.startsWith("phonepe:")
            || url.startsWith("paytmmp:")
            || url.startsWith("gpay:")
            || url.startsWith("bhim:");
    }

    /**
     * Hand the URL to whichever app claims it.
     *
     * Returns false when nothing can handle it, which lets the WebView carry on
     * with its normal behaviour instead of leaving the shopper on a dead screen
     * — someone without the chosen app installed should fall back to the other
     * payment methods, not hit a blank page.
     */
    private boolean launchExternalApp(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent:")) {
                // intent: URLs carry their own target and, usually, a
                // browser_fallback_url for when the app is not installed.
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                if (intent.resolveActivity(getPackageManager()) == null) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                        return true;
                    }
                    return false;
                }
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                // A bare upi: URL is deliberately left to the chooser when
                // several apps are installed — picking one for the shopper
                // would be wrong.
                if (intent.resolveActivity(getPackageManager()) == null) return false;
            }
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            return false;
        }
    }

    private void removePopup() {
        if (popupWebView != null) {
            ViewGroup parent = (ViewGroup) popupWebView.getParent();
            if (parent != null) parent.removeView(popupWebView);
            popupWebView.destroy();
            popupWebView = null;
        }
    }

    /**
     * Back should dismiss the bank page rather than the whole app — otherwise a
     * shopper who taps back mid-payment loses their cart.
     */
    @Override
    public void onBackPressed() {
        if (popupWebView != null) {
            if (popupWebView.canGoBack()) popupWebView.goBack();
            else removePopup();
            return;
        }
        super.onBackPressed();
    }
}
