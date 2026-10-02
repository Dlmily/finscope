import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  quote: { symbol: "000001.SZ", displayName: "平安银行", price: 10, change: 0.12, changePercent: 1.21, previousClose: 9.88, open: 9.9, high: 10.1, low: 9.8, volume: 1000, timestamp: 1787792400, currency: "CNY", market: "A_SHARE", assetType: "EQUITY", source: "公开行情测试源" },
}));

vi.mock("../mobile/src/services/marketProvider", () => ({
  DOMESTIC_SYMBOLS: [{ symbol: "000001.SZ", name: "平安银行", market: "A_SHARE", currency: "CNY", assetType: "EQUITY", exchange: "SZSE" }],
  getDeviceMarketProvider: () => ({
    id: "TENCENT", label: "公开行情测试源", keyLabel: "无需密钥", requiresCredential: false, defaultSymbols: ["000001.SZ"], validationSymbol: "000001.SZ",
    getQuote: async () => fixture.quote,
    getCandles: async () => [],
    getIntraday: async () => [],
    getCompanyResearch: async () => ({ symbol: fixture.quote.symbol, source: fixture.quote.source, refreshedAt: Date.now(), profile: { name: fixture.quote.displayName }, metrics: { peTtm: null, netProfitMarginTtm: null }, news: [] }),
    searchSymbols: async () => [],
  }),
}));
vi.mock("../mobile/src/services/marketSource", () => ({ resolveSavedMarketSource: () => "TENCENT" }));

import App from "../mobile/App";

function textContent(node: { children?: unknown[] }): string {
  return (node.children ?? []).map((child) => typeof child === "string" ? child : typeof child === "object" && child ? textContent(child as { children?: unknown[] }) : "").join("");
}

function pressByTestId(root: ReturnType<typeof create>, testID: string) {
  const target = root.root.findAllByProps({ testID }).find((node) => typeof node.props.onPress === "function");
  if (!target) throw new Error(`未找到可点击控件：${testID}`);
  target.props.onPress();
}

describe("public-source watchlist to trade interaction", () => {
  it("selects a watchlist quote, navigates to trade, confirms 100 shares, and shows a holding plus fill", async () => {
    let rendered: ReturnType<typeof create>;
    await act(async () => {
      rendered = create(React.createElement(App));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const root = rendered!;
    await act(async () => { pressByTestId(root, "watchlist-quote-000001.SZ"); await Promise.resolve(); });
    act(() => { pressByTestId(root, "navigation-trade"); });
    act(() => { pressByTestId(root, "trade-buy-action"); });
    expect(root.root.findAllByType("Modal").some((modal) => modal.props.visible)).toBe(true);
    act(() => { pressByTestId(root, "trade-confirm-order"); });
    const renderedText = textContent(root.toJSON() as { children?: unknown[] });
    expect(renderedText).toContain("100 股");
    expect(renderedText).toContain("BUY");
    expect(renderedText).toContain("平安银行");
  });
});
