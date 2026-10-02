import { describe, expect, it } from "vitest";
import { validatePaperOrder } from "./trading";
import { applyLocalPaperOrder, calculateAccountMetrics, mergePositionMarks, preferredTradeSymbol } from "../mobile/src/services/paperAccount";
import { getPortfolioQuoteRefreshFeedback, resolvePortfolioQuoteRefreshStatus, shouldRefreshPortfolioQuotes } from "../mobile/src/services/marketQuoteRefresh";
import { ABOUT_DEVELOPER, ABOUT_ENTRY_LABEL, ABOUT_FEATURES, ABOUT_NOTICE, ABOUT_TERMS } from "../mobile/src/services/applicationContent";
import { paperOrderPreflight, prepareStockDetailAction, resolveExecutableQuote } from "../mobile/src/services/stockInteraction";

describe("paper trading validation", () => {
  it("deducts virtual cash and updates weighted average cost after a buy", () => {
    expect(validatePaperOrder({ side: "BUY", quantity: 10, marketPrice: 123.45, cash: 5000, holdingQuantity: 5, averageCost: 100 })).toEqual({ gross: 1234.5, nextCash: 3765.5, nextQuantity: 15, nextAverageCost: 115.6333, realizedPnl: 0 });
  });

  it("accepts one or more 100-share buy quantities when virtual cash covers the order", () => {
    expect(validatePaperOrder({ side: "BUY", quantity: 100, marketPrice: 10, cash: 3000, holdingQuantity: 0, averageCost: 0 })).toMatchObject({ gross: 1000, nextCash: 2000, nextQuantity: 100 });
    expect(validatePaperOrder({ side: "BUY", quantity: 200, marketPrice: 10, cash: 3000, holdingQuantity: 0, averageCost: 0 })).toMatchObject({ gross: 2000, nextCash: 1000, nextQuantity: 200 });
  });

  it("prefers an affordable equity over an index when selecting a public-market trade target", () => {
    const quotes = [{ symbol: "000001.SH", price: 3500, assetType: "INDEX" as const }, { symbol: "600519.SH", price: 1500, assetType: "EQUITY" as const }, { symbol: "601318.SH", price: 50, assetType: "EQUITY" as const }];
    expect(preferredTradeSymbol(quotes, 100000)).toBe("601318.SH");
    expect(preferredTradeSymbol(quotes, 3000)).toBe("600519.SH");
  });

  it("prepares a search or position detail action by adding the symbol once to the current watchlist", () => {
    expect(prepareStockDetailAction(" 600519.sh ", ["000001.SZ"])).toEqual({ symbol: "600519.SH", nextWatchlist: ["000001.SZ", "600519.SH"] });
    expect(prepareStockDetailAction("600519.sh", ["600519.SH"])).toEqual({ symbol: "600519.SH", nextWatchlist: ["600519.SH"] });
    expect(prepareStockDetailAction(" ", ["600519.SH"])).toBeNull();
  });

  it("uses the selected current quote as an execution fallback after opening a stock detail", () => {
    const selected = { symbol: "000001.SZ", price: 10 };
    expect(resolveExecutableQuote([], selected, "000001.SZ")).toEqual(selected);
    expect(resolveExecutableQuote([{ symbol: "000001.SZ", price: 11 }], selected, "000001.SZ")).toEqual({ symbol: "000001.SZ", price: 11 });
  });

  it("permits a buy from the transaction modal quote even when navigation has not written that quote back to the list", () => {
    const transactionQuote = resolveExecutableQuote([], { symbol: "000001.SZ", price: 10 }, "000001.SZ");
    expect(paperOrderPreflight({ side: "BUY", quantity: 100, quote: transactionQuote, cash: 100000, holdingQuantity: 0 })).toBeNull();
    expect(paperOrderPreflight({ side: "BUY", quantity: 100, quote: transactionQuote, cash: 999, holdingQuantity: 0 })).toBe("insufficient-cash");
  });

  it("provides the about entry, feature list, developer, notice and user terms content", () => {
    expect(ABOUT_ENTRY_LABEL).toBe("关于应用");
    expect(ABOUT_DEVELOPER).toBe("Dlmily");
    expect(ABOUT_FEATURES.map(([title]) => title)).toEqual(expect.arrayContaining(["行情与图表", "本地模拟交易", "数据源切换", "学习研究"]));
    expect(ABOUT_NOTICE).toContain("不构成投资建议");
    expect(ABOUT_TERMS).toContain("本地虚拟记录");
  });

  it("prevents buying beyond virtual cash", () => {
    expect(() => validatePaperOrder({ side: "BUY", quantity: 10, marketPrice: 200, cash: 1000, holdingQuantity: 0, averageCost: 0 })).toThrow("Insufficient virtual cash");
  });

  it("prevents selling beyond a virtual position and calculates realized P&L", () => {
    expect(() => validatePaperOrder({ side: "SELL", quantity: 11, marketPrice: 120, cash: 0, holdingQuantity: 10, averageCost: 100 })).toThrow("Insufficient virtual position");
    expect(validatePaperOrder({ side: "SELL", quantity: 4, marketPrice: 120, cash: 200, holdingQuantity: 10, averageCost: 100 })).toEqual({ gross: 480, nextCash: 680, nextQuantity: 6, nextAverageCost: 100, realizedPnl: 80 });
  });

  it("keeps the last valid mark and cumulative return when a switched source has no quote for an existing position", () => {
    const positions = [{ symbol: "600519.SH", quantity: 10, averageCost: 100, lastPrice: 120, lastPriceTimestamp: 1766575800 }];
    const beforeSwitch = calculateAccountMetrics(1000, 0, positions, []);
    expect(beforeSwitch).toMatchObject({ marketValue: 1200, totalAssets: 1200, returnAmount: 200, unrealizedPnl: 200, dayPnl: null });

    const refreshed = mergePositionMarks(positions, [{ symbol: "600519.SH", price: 125, previousClose: 123, timestamp: 1766662200 }]);
    expect(refreshed.changed).toBe(true);
    expect(calculateAccountMetrics(1000, 0, refreshed.positions, [{ symbol: "600519.SH", price: 125, previousClose: 123 }])).toMatchObject({ totalAssets: 1250, returnAmount: 250, dayPnl: 20 });
  });

  it("persists an order's display name and currency for cross-source holding and fill rendering", () => {
    const next = applyLocalPaperOrder({ cash: 100000, positions: [], trades: [] }, {
      side: "BUY", quantity: 100, quote: { symbol: "000001.SZ", price: 11.54, timestamp: 1766575800, displayName: "平安银行", currency: "CNY" }, id: "cross-source-fill", executedAt: 1766575800000,
    });
    expect(next.positions[0]).toMatchObject({ symbol: "000001.SZ", displayName: "平安银行", currency: "CNY" });
    expect(next.trades[0]).toMatchObject({ symbol: "000001.SZ", displayName: "平安银行", currency: "CNY" });
  });

  it("recalculates holdings immediately when a foreground quote refresh produces a newer valid mark", () => {
    const positions = [{ symbol: "600519.SH", quantity: 200, averageCost: 100, lastPrice: 101, lastPriceTimestamp: 1766575800 }];
    const refresh = mergePositionMarks(positions, [{ symbol: "600519.SH", price: 108, previousClose: 103, timestamp: 1766662200 }]);
    expect(refresh.changed).toBe(true);
    expect(calculateAccountMetrics(25000, 5000, refresh.positions, [{ symbol: "600519.SH", price: 108, previousClose: 103 }])).toMatchObject({ marketValue: 21600, totalAssets: 26600, returnAmount: 1600, dayPnl: 1000 });
  });

  it("refreshes holdings only when the trade page opens or the application returns to foreground", () => {
    const base = { activeTab: "watchlist" as const, foregroundRefreshVersion: 0, hasApiKey: false, hasPositions: true, providerRequiresCredential: false, sourceHydrated: true, storageReady: true };
    expect(shouldRefreshPortfolioQuotes(base)).toBe(false);
    expect(shouldRefreshPortfolioQuotes({ ...base, activeTab: "trade" })).toBe(true);
    expect(shouldRefreshPortfolioQuotes({ ...base, foregroundRefreshVersion: 1 })).toBe(true);
    expect(shouldRefreshPortfolioQuotes({ ...base, providerRequiresCredential: true })).toBe(false);
    expect(shouldRefreshPortfolioQuotes({ ...base, providerRequiresCredential: true, hasApiKey: true, foregroundRefreshVersion: 1 })).toBe(true);
  });

  it("reports complete, partial, and missing position quote coverage for the trading screen", () => {
    expect(resolvePortfolioQuoteRefreshStatus(["600519.SH", "00700.HK"], ["600519.SH", "00700.HK"])).toBe("updated");
    expect(resolvePortfolioQuoteRefreshStatus(["600519.SH", "00700.HK"], ["600519.SH"])).toBe("partial");
    expect(resolvePortfolioQuoteRefreshStatus(["600519.SH"], ["000001.SH"])).toBe("no-quote");
  });

  it("provides visible feedback for refresh success time, partial data, no quote, and failed refreshes", () => {
    const formatTime = (value: number) => `时间-${value}`;
    expect(getPortfolioQuoteRefreshFeedback("updated", 123, formatTime)).toEqual({ copy: "最近成功刷新：时间-123", tone: "muted" });
    expect(getPortfolioQuoteRefreshFeedback("partial", null, formatTime)).toEqual({ copy: "部分持仓已按当前报价更新；其余保留最近有效标记。", tone: "warning" });
    expect(getPortfolioQuoteRefreshFeedback("no-quote", null, formatTime)).toEqual({ copy: "当前数据源未返回任一持仓报价；市值保留最近有效标记。", tone: "error" });
    expect(getPortfolioQuoteRefreshFeedback("failed", null, formatTime)).toEqual({ copy: "自动刷新暂未成功；市值保留最近有效标记，可手动重试。", tone: "error" });
    expect(getPortfolioQuoteRefreshFeedback("idle", null, formatTime)).toEqual({ copy: "进入持仓页后将自动刷新报价。", tone: "muted" });
  });
});
