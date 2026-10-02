package space.manus.finscopewebviewtest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

public class MainActivity extends Activity {
  private static final long FOREGROUND_QUOTE_REFRESH_MS = 30000L;
  private volatile boolean chartCursorLocked = false;
  private final Handler foregroundHandler = new Handler(Looper.getMainLooper());
  private WebView tradingWebView;
  private boolean pageReady = false;

  public class NativeChartBridge {
    @JavascriptInterface
    public void setChartCursorLocked(boolean locked) {
      chartCursorLocked = locked;
    }
  }

  public class NativeWidgetBridge {
    @JavascriptInterface
    public void updateSnapshot(String snapshot) {
      WidgetDataStore.saveSnapshot(MainActivity.this, snapshot);
      FinscopePortfolioWidgetProvider.refreshAll(MainActivity.this);
    }

    @JavascriptInterface
    public String consumePendingOrder() {
      return WidgetDataStore.pendingOrder(MainActivity.this);
    }

    @JavascriptInterface
    public void acknowledgeOrder(String orderId) {
      WidgetDataStore.clearPendingOrder(MainActivity.this, orderId == null ? "" : orderId);
      FinscopePortfolioWidgetProvider.refreshAll(MainActivity.this);
    }
  }

  private final Runnable foregroundQuoteRefresh = new Runnable() {
    @Override
    public void run() {
      if (!pageReady || tradingWebView == null || isFinishing()) return;
      tradingWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('finscopeForegroundQuoteRefresh'));", null);
      foregroundHandler.postDelayed(this, FOREGROUND_QUOTE_REFRESH_MS);
    }
  };

  private void startForegroundQuoteRefresh() {
    foregroundHandler.removeCallbacks(foregroundQuoteRefresh);
    if (pageReady && tradingWebView != null) foregroundHandler.post(foregroundQuoteRefresh);
  }

  private void dispatchPendingWidgetOrder() {
    if (!pageReady || tradingWebView == null) return;
    String pending = WidgetDataStore.pendingOrder(this);
    if (pending.isEmpty()) return;
    String script = "window.dispatchEvent(new CustomEvent('finscopeWidgetOrder',{detail:" + JSONObject.quote(pending) + "}));";
    tradingWebView.evaluateJavascript(script, null);
  }

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(6, 6, 9));

    WebView webView = new WebView(this);
    tradingWebView = webView;
    webView.setBackgroundColor(Color.TRANSPARENT);
    webView.setAlpha(0f);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setAllowUniversalAccessFromFileURLs(true);
    webView.addJavascriptInterface(new NativeChartBridge(), "FinscopeNativeBridge");
    webView.addJavascriptInterface(new NativeWidgetBridge(), "FinscopeWidgetBridge");
    webView.setOnTouchListener((view, event) -> {
      // 普通页面触摸（包括交易确认）完全交由 WebView 默认分发。仅在图表长按已锁定后，
      // 才桥接该次拖动的 MOVE/UP/CANCEL，以固定图表时间轴并连续更新十字光标。
      if (!chartCursorLocked) return false;
      String phase;
      switch (event.getActionMasked()) {
        case MotionEvent.ACTION_MOVE: phase = "move"; break;
        case MotionEvent.ACTION_UP: phase = "up"; break;
        case MotionEvent.ACTION_CANCEL: phase = "cancel"; break;
        default: return false;
      }
      float density = getResources().getDisplayMetrics().density;
      float cssX = event.getX() / density;
      float cssY = event.getY() / density;
      String script = "window.dispatchEvent(new CustomEvent('finscopeNativeChartTouch',{detail:{phase:'" + phase + "',x:" + cssX + ",y:" + cssY + "}}));";
      webView.evaluateJavascript(script, null);
      if (phase.equals("up") || phase.equals("cancel")) chartCursorLocked = false;
      return phase.equals("move");
    });
    View launchCover = new View(this);
    launchCover.setBackgroundColor(Color.rgb(6, 6, 9));
    root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    root.addView(launchCover, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    webView.setWebViewClient(new WebViewClient() {
      @Override
      public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        pageReady = true;
        startForegroundQuoteRefresh();
        dispatchPendingWidgetOrder();
        view.animate().alpha(1f).setDuration(180).start();
        launchCover.animate().alpha(0f).setDuration(180).withEndAction(() -> root.removeView(launchCover)).start();
      }
    });
    webView.loadUrl("file:///android_asset/index.html");
    setContentView(root);
  }

  @Override
  protected void onResume() {
    super.onResume();
    startForegroundQuoteRefresh();
    dispatchPendingWidgetOrder();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    dispatchPendingWidgetOrder();
  }

  @Override
  protected void onPause() {
    foregroundHandler.removeCallbacks(foregroundQuoteRefresh);
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    foregroundHandler.removeCallbacks(foregroundQuoteRefresh);
    pageReady = false;
    tradingWebView = null;
    super.onDestroy();
  }
}
