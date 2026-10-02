package space.manus.finscopewebviewtest;

import android.content.Context;

final class WidgetDataStore {
  private static final String PREFS = "finscope_widget_state";
  private static final String SNAPSHOT = "snapshot";
  private static final String PENDING_ORDER = "pending_order";

  private WidgetDataStore() {}

  static void saveSnapshot(Context context, String json) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SNAPSHOT, json).apply();
  }

  static String snapshot(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SNAPSHOT, "");
  }

  static void savePendingOrder(Context context, String json) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PENDING_ORDER, json).apply();
  }

  static String pendingOrder(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PENDING_ORDER, "");
  }

  static void clearPendingOrder(Context context, String expectedId) {
    String pending = pendingOrder(context);
    if (expectedId.isEmpty() || pending.contains("\"id\":\"" + expectedId + "\"")) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PENDING_ORDER).apply();
    }
  }
}
