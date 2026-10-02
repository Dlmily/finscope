import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "..");

describe("Finscope intraday brand mark", () => {
  it("adds a compact intraday path to the in-app two-ribbon brand mark", () => {
    const app = readFileSync(resolve(projectRoot, "mobile/App.tsx"), "utf8");
    expect(app).toContain('d="M4 20 L8 15 L10.5 17 L14 9 L18 11"');
    expect(app).toContain("stroke={C.lime}");
  });

  it("uses the generated intraday mark as the Android launcher icon", () => {
    const manifest = readFileSync(resolve(projectRoot, "webview-apk/app/src/main/AndroidManifest.xml"), "utf8");
    expect(manifest).toContain('android:icon="@drawable/finscope_intraday_mark"');
    expect(manifest).toContain('android:roundIcon="@drawable/finscope_intraday_mark"');
    const drawable = resolve(projectRoot, "webview-apk/app/src/main/res/drawable/finscope_intraday_mark.xml");
    expect(existsSync(drawable)).toBe(true);
    expect(readFileSync(drawable, "utf8")).toContain('android:pathData="M34,72L44,59L51,64L65,39L77,47"');
    expect(readFileSync(drawable, "utf8")).toContain('android:strokeColor="#80FF70"');
  });
});
