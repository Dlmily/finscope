import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const activityPath = new URL("../webview-apk/app/src/main/java/space/manus/finscopewebviewtest/MainActivity.java", import.meta.url);

describe("Android WebView touch isolation", () => {
  it("passes ordinary touches through and bridges only an already-locked chart drag", () => {
    const source = readFileSync(activityPath, "utf8");

    expect(source).toContain("if (!chartCursorLocked) return false;");
    expect(source).toContain("finscopeNativeChartTouch");
    expect(source).toContain("return phase.equals(\"move\");");
    expect(source).not.toContain("finscopeNativeOrderConfirm");
  });
});
