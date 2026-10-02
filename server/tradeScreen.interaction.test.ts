import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { TradeScreen } from "../mobile/App";
import { applyLocalPaperOrder } from "../mobile/src/services/paperAccount";

type TradeScreenProps = React.ComponentProps<typeof TradeScreen>;
type Quote = NonNullable<TradeScreenProps["selected"]>;

describe("public-source watchlist to trade-screen buy interaction", () => {
  it("opens the modal from the selected quote and confirms a buy that updates holding and trade records", () => {
    const quote: Quote = {
      symbol: "000001.SZ", displayName: "平安银行", price: 10, change: 0.12, changePercent: 1.21,
      previousClose: 9.88, open: 9.9, high: 10.1, low: 9.8, volume: 1000, timestamp: 1787792400,
      currency: "CNY", market: "A_SHARE", assetType: "EQUITY", source: "公开行情测试源",
    };
    let account = { initialCash: 100000, cash: 100000, positions: [], trades: [], snapshots: [] } as TradeScreenProps["account"];
    let orderCallCount = 0;
    const onOrder: TradeScreenProps["onOrder"] = (side, quantity, symbol, executionQuote) => {
      if (!executionQuote || symbol !== quote.symbol) return false;
      orderCallCount += 1;
      const next = applyLocalPaperOrder(account, { side, quantity, quote: executionQuote, id: "ui-watchlist-buy", executedAt: 1787792400000 });
      account = { ...account, ...next };
      return true;
    };
    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(React.createElement(TradeScreen, { account, quotes: [quote], selected: quote, onOrder, onReset: () => undefined, refreshing: false, onRefresh: () => undefined, refreshStatus: "updated", lastSuccessfulRefreshAt: 1787792400000, onOpenPositionDetails: () => undefined }));
    });
    const root = rendered!;
    act(() => { root.root.findByProps({ testID: "trade-buy-action" }).props.onPress(); });
    expect(root.root.findByType("Modal").props.visible).toBe(true);
    const confirmButton = root.root.findByProps({ testID: "trade-confirm-order" });
    expect(confirmButton.props.onTouchEnd).toBeUndefined();
    act(() => { confirmButton.props.onPress(); });
    expect(orderCallCount).toBe(1);
    expect(account).toMatchObject({ cash: 99000, positions: [expect.objectContaining({ symbol: "000001.SZ", quantity: 100 })], trades: [expect.objectContaining({ id: "ui-watchlist-buy", side: "BUY", price: 10 })] });
    expect(root.root.findByProps({ testID: "trade-order-feedback" }).findByType("Text").props.children).toContain("买入已成交");
  });

  it("keeps legacy domestic holdings named and priced in CNY after the selected Finnhub quote switches the screen context", () => {
    const usQuote: Quote = { symbol: "AAPL", displayName: "AAPL", price: 313.45, change: 1, changePercent: 0.3, previousClose: 312.45, timestamp: 1787792400, currency: "USD", market: "US", assetType: "EQUITY", source: "Finnhub" };
    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(React.createElement(TradeScreen, {
        account: { initialCash: 100000, cash: 98846, positions: [{ symbol: "000001.SZ", quantity: 100, averageCost: 11.54, lastPrice: 11.64, lastPriceTimestamp: 1787792400 }], trades: [], snapshots: [] },
        quotes: [usQuote], selected: usQuote, onOrder: () => false, onReset: () => undefined, refreshing: false, onRefresh: () => undefined, refreshStatus: "partial", lastSuccessfulRefreshAt: 1787792400000, onOpenPositionDetails: () => undefined,
      }));
    });
    const position = rendered!.root.findByProps({ testID: "position-000001.SZ" });
    const visibleText = position.findAllByType("Text").map((node) => String(node.props.children));
    expect(visibleText.join(" ")).toContain("平安银行");
    expect(visibleText.join(" ")).toContain("¥");
  });

  it("loads a holding's original-provider quote when the current source has no quote, then submits with that provider", async () => {
    const currentQuote: Quote = { symbol: "000001.SZ", displayName: "平安银行", price: 11.54, change: 0, changePercent: 0, previousClose: 11.54, timestamp: 1787792400, currency: "CNY", market: "A_SHARE", assetType: "EQUITY", source: "公开行情测试源" };
    const originalQuote: Quote = { symbol: "AAPL", displayName: "Apple Inc.", price: 313.45, change: 1, changePercent: 0.3, previousClose: 312.45, timestamp: 1787792400, currency: "USD", market: "US", assetType: "EQUITY", source: "Finnhub" };
    const onOrder = vi.fn(() => true);
    let rendered: ReturnType<typeof create>;
    await act(async () => {
      rendered = create(React.createElement(TradeScreen, {
        account: { initialCash: 100000, cash: 90000, positions: [{ symbol: "AAPL", displayName: "Apple Inc.", currency: "USD", market: "US", sourceId: "FINNHUB", quantity: 5, averageCost: 300, lastPrice: 313.45, lastPriceTimestamp: 1787792400 }], trades: [], snapshots: [] },
        quotes: [currentQuote], selected: currentQuote, onOrder, onReset: () => undefined, refreshing: false, onRefresh: () => undefined, refreshStatus: "partial", lastSuccessfulRefreshAt: 1787792400000, onOpenPositionDetails: () => undefined,
        onResolvePositionQuote: async () => ({ quote: originalQuote, sourceId: "FINNHUB" }), currentMarketSource: "TENCENT",
      }));
    });
    await act(async () => {
      rendered!.root.findByProps({ testID: "position-buy-AAPL" }).props.onPress();
      await Promise.resolve();
    });
    expect(rendered!.root.findByType("Modal").props.visible).toBe(true);
    act(() => { rendered!.root.findByProps({ testID: "trade-confirm-order" }).props.onPress(); });
    expect(onOrder).toHaveBeenCalledWith("BUY", 100, "AAPL", originalQuote, "FINNHUB");
  });

  it("paginates transaction history into seven entries per page", () => {
    const quote: Quote = { symbol: "AAPL", displayName: "AAPL", price: 313.45, change: 1, changePercent: 0.3, previousClose: 312.45, timestamp: 1787792400, currency: "USD", market: "US", assetType: "EQUITY", source: "Finnhub" };
    const trades = Array.from({ length: 13 }, (_, index) => ({ id: `fill-${index + 1}`, side: "BUY" as const, symbol: "AAPL", displayName: `Apple fill ${index + 1}`, currency: "USD" as const, quantity: 1, price: 300 + index, realizedPnl: 0, executedAt: 1787792400000 + index }));
    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(React.createElement(TradeScreen, {
        account: { initialCash: 100000, cash: 99000, positions: [], trades, snapshots: [] }, quotes: [quote], selected: quote,
        onOrder: () => false, onReset: () => undefined, refreshing: false, onRefresh: () => undefined, refreshStatus: "idle", lastSuccessfulRefreshAt: null, onOpenPositionDetails: () => undefined,
      }));
    });
    const root = rendered!.root;
    const visibleRows = () => root.findAllByProps({ testID: "trade-history-row" }).filter((node) => typeof node.type === "string");
    const pageLabel = () => root.findAllByProps({ testID: "trade-history-page-label" }).find((node) => typeof node.type === "string");
    expect(visibleRows()).toHaveLength(7);
    expect(String(pageLabel()?.props.children)).toContain("每页 7 条");
    act(() => { root.findByProps({ testID: "trade-history-next-page" }).props.onPress(); });
    expect(visibleRows()).toHaveLength(6);
    expect(String(pageLabel()?.props.children)).toContain("第 ,2, / ,2, 页");
  });
});
