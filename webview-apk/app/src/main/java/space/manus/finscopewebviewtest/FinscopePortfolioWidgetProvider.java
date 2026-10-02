package space.manus.finscopewebviewtest;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

public abstract class FinscopePortfolioWidgetProvider extends AppWidgetProvider {
  static final String ACTION_WIDGET_ORDER = "space.manus.finscopewebviewtest.WIDGET_ORDER";
  abstract int layoutId();

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
    for (int widgetId : widgetIds) update(context, manager, widgetId, layoutId());
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    super.onReceive(context, intent);
    if (!ACTION_WIDGET_ORDER.equals(intent.getAction())) return;
    try {
      JSONObject snapshot = new JSONObject(WidgetDataStore.snapshot(context));
      JSONObject order = new JSONObject();
      order.put("id", String.valueOf(System.currentTimeMillis()));
      order.put("side", intent.getStringExtra("side"));
      order.put("symbol", snapshot.optString("symbol"));
      order.put("quantity", Math.max(1, snapshot.optInt("defaultQuantity", 1)));
      order.put("price", snapshot.optDouble("price", 0));
      order.put("displayName", snapshot.optString("displayName"));
      order.put("currency", snapshot.optString("currency", "CNY"));
      order.put("market", snapshot.optString("market", "A_SHARE"));
      order.put("sourceId", snapshot.optString("sourceId", "TENCENT"));
      WidgetDataStore.savePendingOrder(context, order.toString());
      Intent launch = new Intent(context, MainActivity.class)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
          .putExtra("finscope_widget_order", true);
      context.startActivity(launch);
    } catch (Exception ignored) {
      // The app will show a usable empty widget until the WebView writes its first account snapshot.
    }
  }

  static void refreshAll(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    refreshProvider(context, manager, FinscopeSquareWidgetProvider.class, R.layout.widget_square);
    refreshProvider(context, manager, FinscopeWideWidgetProvider.class, R.layout.widget_wide);
  }

  private static void refreshProvider(Context context, AppWidgetManager manager, Class<? extends AppWidgetProvider> clazz, int layout) {
    int[] ids = manager.getAppWidgetIds(new ComponentName(context, clazz));
    for (int id : ids) update(context, manager, id, layout);
  }

  private static void update(Context context, AppWidgetManager manager, int widgetId, int layout) {
    RemoteViews views = new RemoteViews(context.getPackageName(), layout);
    try {
      JSONObject snapshot = new JSONObject(WidgetDataStore.snapshot(context));
      String symbol = snapshot.optString("symbol", "暂无持仓");
      String name = snapshot.optString("displayName", symbol);
      String currency = snapshot.optString("currency", "CNY");
      double price = snapshot.optDouble("price", 0);
      double pnl = snapshot.optDouble("pnl", 0);
      double pnlPercent = snapshot.optDouble("pnlPercent", 0);
      views.setTextViewText(R.id.widget_symbol, name + " · " + symbol);
      views.setTextViewText(R.id.widget_price, formatMoney(price, currency));
      views.setTextViewText(R.id.widget_pnl, String.format("%+.2f%%  %s", pnlPercent, formatMoney(pnl, currency)));
      views.setTextColor(R.id.widget_pnl, pnl >= 0 ? Color.rgb(255, 78, 113) : Color.rgb(128, 255, 112));
      views.setTextViewText(R.id.widget_subtitle, "持仓 " + snapshot.optInt("quantity", 0) + " 股 · 最近可用价");
      JSONArray points = snapshot.optJSONArray("chartPoints");
      views.setImageViewBitmap(R.id.widget_chart, WidgetChartRenderer.render(points, layout == R.layout.widget_square ? 300 : 360, layout == R.layout.widget_square ? 122 : 88));
      bindOrder(context, views, R.id.widget_buy, "BUY", widgetId);
      bindOrder(context, views, R.id.widget_sell, "SELL", widgetId);
    } catch (Exception error) {
      views.setTextViewText(R.id.widget_symbol, "Finscope 持仓");
      views.setTextViewText(R.id.widget_price, "打开应用加载账户");
      views.setTextViewText(R.id.widget_pnl, "暂无可用持仓快照");
      views.setTextViewText(R.id.widget_subtitle, "打开应用后将自动同步");
    }
    manager.updateAppWidget(widgetId, views);
  }

  private static void bindOrder(Context context, RemoteViews views, int viewId, String side, int widgetId) {
    Intent intent = new Intent(context, FinscopeSquareWidgetProvider.class).setAction(ACTION_WIDGET_ORDER).putExtra("side", side).setData(Uri.parse("finscope://widget/" + widgetId + "/" + side));
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    views.setOnClickPendingIntent(viewId, PendingIntent.getBroadcast(context, viewId + widgetId, intent, flags));
  }

  private static String formatMoney(double value, String currency) {
    String sign = "USD".equals(currency) ? "$" : "HKD".equals(currency) ? "HK$" : "¥";
    return String.format("%s%,.2f", sign, value);
  }
}
