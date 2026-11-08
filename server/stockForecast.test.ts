import { describe, expect, it } from "vitest";
import { predictStockDirection } from "../mobile/src/services/stockForecast";

function dailySeries(count: number) {
  let price = 100;
  return Array.from({ length: count }, (_, index) => {
    const dailyChange =
      0.00015 +
      Math.sin(index * 0.17) * 0.012 +
      Math.cos(index * 0.047) * 0.006;
    price *= Math.exp(dailyChange);
    return { timestamp: index * 86_400, close: price };
  });
}

describe("stock direction forecast", () => {
  it("returns a bounded five-session model estimate and chronological validation metrics", () => {
    const result = predictStockDirection(dailySeries(420));
    expect(result).toMatchObject({
      horizonTradingDays: 5,
      direction: expect.stringMatching(/^(UP|DOWN)$/),
    });
    expect(result.upProbability).toBeGreaterThanOrEqual(0);
    expect(result.upProbability).toBeLessThanOrEqual(1);
    expect(result.sampleCount).toBeGreaterThan(200);
    expect(result.walkForward.observations).toBeGreaterThanOrEqual(30);
    expect(result.walkForward.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.walkForward.accuracy).toBeLessThanOrEqual(1);
    expect(result.walkForward.majorityBaselineAccuracy).toBeGreaterThanOrEqual(
      0
    );
    expect(result.walkForward.majorityBaselineAccuracy).toBeLessThanOrEqual(1);
    expect(result.walkForward.brierScore).toBeGreaterThanOrEqual(0);
    expect(result.walkForward.brierScore).toBeLessThanOrEqual(1);
  });

  it("rejects insufficient history instead of fabricating an estimate", () => {
    expect(() => predictStockDirection(dailySeries(160))).toThrow(
      "有效历史不足"
    );
  });

  it("rejects unsupported horizons", () => {
    expect(() => predictStockDirection(dailySeries(420), 0)).toThrow(
      "预测周期须为 1 至 20 个交易日"
    );
    expect(() => predictStockDirection(dailySeries(420), 21)).toThrow(
      "预测周期须为 1 至 20 个交易日"
    );
  });

  it("filters invalid prices and still requires enough usable candles", () => {
    const data = [
      ...dailySeries(420),
      { timestamp: 421 * 86_400, close: Number.NaN },
      { timestamp: 422 * 86_400, close: -1 },
    ];
    expect(predictStockDirection(data).sampleCount).toBeGreaterThan(200);
    expect(() => predictStockDirection(data.slice(0, 200))).toThrow(
      "有效历史不足"
    );
  });
});
