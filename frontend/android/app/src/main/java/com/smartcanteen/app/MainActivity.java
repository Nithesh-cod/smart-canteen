package com.smartcanteen.app;

import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;

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

                // Keep navigation inside this WebView. Handing bank URLs to an
                // external browser breaks the return trip: the payment result
                // would land in Chrome and never reach checkout's handler.
                popupWebView.setWebViewClient(new WebViewClient());
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
