import { describe, expect, it } from "vitest";
import { buildWidgetPortfolioSnapshot } from "../mobile/src/services/widgetPortfolioSnapshot";

describe("widget portfolio snapshot", () => {
  it("selects the currently viewed holding and derives its chart, P&L and configured order quantity", () => {
    const snapshot = buildWidgetPortfolioSnapshot({
      positions: [{ symbol: "AAPL", displayName: "Apple Inc.", quantity: 12, averageCost: 100, lastPrice: 103, currency: "USD", market: "US", sourceId: "FINNHUB" }],
      quotes: [{ symbol: "AAPL", displayName: "Apple Inc.", price: 110, currency: "USD", market: "US" }],
      selectedSymbol: "AAPL", intraday: [104, 106, 105, 110], candles: [90, 100], defaultQuantity: 3,
    });
    expect(snapshot).toEqual(expect.objectContaining({ symbol: "AAPL", displayName: "Apple Inc.", price: 110, pnl: 120, pnlPercent: 10, currency: "USD", market: "US", sourceId: "FINNHUB", defaultQuantity: 3, chartPoints: [104, 106, 105, 110] }));
  });

  it("falls back to the first holding and a two-point cost-to-last-price line when it has no loaded chart", () => {
    const snapshot = buildWidgetPortfolioSnapshot({ positions: [{ symbol: "000001.SZ", quantity: 100, averageCost: 10, lastPrice: 10.5, displayName: "平安银行", market: "A_SHARE" }], quotes: [], intraday: [], candles: [], defaultQuantity: 0 });
    expect(snapshot).toEqual(expect.objectContaining({ symbol: "000001.SZ", currency: "CNY", sourceId: "TENCENT", defaultQuantity: 1, chartPoints: [10, 10.5] }));
  });
});
