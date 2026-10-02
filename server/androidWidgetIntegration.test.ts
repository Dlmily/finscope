import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Android portfolio widgets", () => {
  it("registers square and wide home-screen widget providers", () => {
    const manifest = read("webview-apk/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain("FinscopeSquareWidgetProvider");
    expect(manifest).toContain("FinscopeWideWidgetProvider");
    expect(read("webview-apk/app/src/main/res/xml/finscope_square_widget.xml")).toContain('android:minWidth="180dp"');
    expect(read("webview-apk/app/src/main/res/xml/finscope_wide_widget.xml")).toContain('android:minWidth="300dp"');
  });

  it("renders price, profit, intraday chart and buy/sell actions, with a WebView order bridge", () => {
    const square = read("webview-apk/app/src/main/res/layout/widget_square.xml");
    const wide = read("webview-apk/app/src/main/res/layout/widget_wide.xml");
    for (const layout of [square, wide]) {
      expect(layout).toContain('android:id="@+id/widget_chart"');
      expect(layout).toContain('android:id="@+id/widget_buy"');
      expect(layout).toContain('android:id="@+id/widget_sell"');
    }
    const activity = read("webview-apk/app/src/main/java/space/manus/finscopewebviewtest/MainActivity.java");
    expect(activity).toContain('new NativeWidgetBridge(), "FinscopeWidgetBridge"');
    expect(activity).toContain("finscopeWidgetOrder");
    const provider = read("webview-apk/app/src/main/java/space/manus/finscopewebviewtest/FinscopePortfolioWidgetProvider.java");
    expect(provider).toContain('order.put("quantity", Math.max(1, snapshot.optInt("defaultQuantity", 1)))');
  });
});
