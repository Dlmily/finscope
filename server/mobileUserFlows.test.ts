import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getDeviceMarketProvider } from "../mobile/src/services/marketProvider";
import { createTradeModal, prepareStockDetailAction, resolveExecutableQuote } from "../mobile/src/services/stockInteraction";
import { validatePaperOrder } from "./trading";
import { applyLocalPaperOrder } from "../mobile/src/services/paperAccount";

const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

function tencentQuote(symbol: string, price = "10.00") {
  const fields = Array.from({ length: 40 }, () => "");
  fields[1] = "平安银行";
  fields[3] = price;
  fields[4] = "9.80";
  fields[5] = "9.90";
  fields[6] = "3000";
  fields[30] = "2026-08-27 15:00:00";
  fields[31] = "0.20";
  fields[32] = "2.04";
  fields[33] = "10.10";
  fields[34] = "9.70";
  fields[37] = "300000";
  return `v_${symbol}="${fields.join("~")}";`;
}

describe("mobile public-market user flows", () => {
  it("searches a public-source equity, adds it once to watchlist, loads detail data, and buys using the loaded quote", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("https://qt.gtimg.cn/q=sz000001")) return Promise.resolve(new Response(tencentQuote("sz000001")));
      if (url.startsWith("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get")) return Promise.resolve(new Response(JSON.stringify({ data: { sz000001: { qfqday: [["2026-08-26", "9.9", "10", "10.1", "9.7", "3000"]] } } })));
      if (url.startsWith("https://ifzq.gtimg.cn/appstock/app/minute/query")) return Promise.resolve(new Response(JSON.stringify({ data: { sz000001: { data: { date: "20260827", data: ["0930 10.00 20 200.00"] } } } })));
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const provider = getDeviceMarketProvider("TENCENT");

    const results = await provider.searchSymbols("平安银行", "");
    const found = results.find((item) => item.symbol === "000001.SZ");
    expect(found).toBeDefined();
    const action = prepareStockDetailAction(found!.symbol, ["600519.SH"]);
    expect(action).toEqual({ symbol: "000001.SZ", nextWatchlist: ["600519.SH", "000001.SZ"] });

    const quote = await provider.getQuote(action!.symbol, "");
    const [candles, intraday, research] = await Promise.all([
      provider.getCandles(action!.symbol, ""),
      provider.getIntraday!(action!.symbol, ""),
      provider.getCompanyResearch(action!.symbol, ""),
    ]);
    expect({ candles: candles.length, intraday: intraday.length, researchSymbol: research.symbol }).toEqual({ candles: 1, intraday: 1, researchSymbol: "000001.SZ" });
    const executionQuote = resolveExecutableQuote([], quote, action!.symbol);
    expect(validatePaperOrder({ side: "BUY", quantity: 100, marketPrice: executionQuote!.price, cash: 100000, holdingQuantity: 0, averageCost: 0 })).toMatchObject({ gross: 1000, nextQuantity: 100 });
    const accountAfterOrder = applyLocalPaperOrder({ cash: 100000, positions: [], trades: [] }, { side: "BUY", quantity: 100, quote: executionQuote!, id: "public-buy-1", executedAt: 1787792400000 });
    expect(accountAfterOrder).toMatchObject({ cash: 99000, positions: [expect.objectContaining({ symbol: "000001.SZ", quantity: 100, averageCost: 10 })], trades: [expect.objectContaining({ id: "public-buy-1", side: "BUY", symbol: "000001.SZ", quantity: 100, price: 10 })] });
  });

  it("carries a quote selected from watchlist into the trade modal and commits its buy without relying on later page state", () => {
    const quoteSelectedOnWatchlist = { symbol: "000001.SZ", price: 10, timestamp: 1787792400 };
    const modal = createTradeModal("BUY", quoteSelectedOnWatchlist, [quoteSelectedOnWatchlist]);
    expect(modal).toEqual({ side: "BUY", symbol: "000001.SZ", quote: quoteSelectedOnWatchlist });
    const account = applyLocalPaperOrder({ cash: 100000, positions: [], trades: [] }, { side: modal!.side, quantity: 200, quote: modal!.quote, id: "watchlist-trade-1", executedAt: 1787792400000 });
    expect(account).toMatchObject({ cash: 98000, positions: [expect.objectContaining({ symbol: "000001.SZ", quantity: 200, lastPrice: 10 })], trades: [expect.objectContaining({ id: "watchlist-trade-1", side: "BUY", quantity: 200 })] });
  });

  it("adds a Tushare search result and loads its latest quote, daily chart, and research detail", async () => {
    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      if (body.api_name === "stock_basic") return Promise.resolve(new Response(JSON.stringify({ code: 0, data: { fields: ["ts_code", "name", "area", "industry"], items: [["000001.SZ", "平安银行", "深圳", "银行"]] } })));
      if (body.api_name === "rt_k") return Promise.resolve(new Response(JSON.stringify({ code: 0, data: { fields: ["ts_code", "name", "pre_close", "high", "open", "low", "close", "vol", "amount", "trade_time"], items: [["000001.SZ", "平安银行", 9.8, 10.1, 9.9, 9.7, 10, 3000, 300000, "20260827"]] } })));
      if (body.api_name === "daily") return Promise.resolve(new Response(JSON.stringify({ code: 0, data: { fields: ["trade_date", "open", "high", "low", "close", "vol"], items: [["20260827", 9.9, 10.1, 9.7, 10, 3000]] } })));
      throw new Error(`Unexpected Tushare operation: ${body.api_name}`);
    }) as typeof fetch;
    const provider = getDeviceMarketProvider("TUSHARE");
    const found = (await provider.searchSymbols("平安银行", "token")).find((item) => item.symbol === "000001.SZ");
    const action = prepareStockDetailAction(found!.symbol, []);
    const quote = await provider.getQuote(action!.symbol, "token");
    const [candles, research] = await Promise.all([provider.getCandles(action!.symbol, "token"), provider.getCompanyResearch(action!.symbol, "token")]);
    expect({ watchlist: action!.nextWatchlist, quote: quote.price, candles: candles.length, research: research.profile.name }).toEqual({ watchlist: ["000001.SZ"], quote: 10, candles: 1, research: "平安银行" });
  });

  it("adds a Finnhub search result and loads quote, daily chart, and company research detail", async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/search?")) return Promise.resolve(new Response(JSON.stringify({ result: [{ symbol: "AAPL", displaySymbol: "AAPL", description: "Apple Inc", type: "Common Stock" }] })));
      if (requestUrl.includes("/quote?")) return Promise.resolve(new Response(JSON.stringify({ c: 200, d: 2, dp: 1, h: 202, l: 198, pc: 198, t: 1787792400 })));
      if (requestUrl.includes("/stock/candle?")) return Promise.resolve(new Response(JSON.stringify({ s: "ok", t: [1787792400], o: [199], h: [202], l: [198], c: [200], v: [5000] })));
      if (requestUrl.includes("/stock/profile2?")) return Promise.resolve(new Response(JSON.stringify({ name: "Apple Inc", exchange: "NASDAQ", ticker: "AAPL" })));
      if (requestUrl.includes("/stock/metric?")) return Promise.resolve(new Response(JSON.stringify({ metric: {} })));
      if (requestUrl.includes("/company-news?")) return Promise.resolve(new Response(JSON.stringify([])));
      throw new Error(`Unexpected Finnhub URL: ${requestUrl}`);
    }) as typeof fetch;
    const provider = getDeviceMarketProvider("FINNHUB");
    const found = (await provider.searchSymbols("apple", "token")).find((item) => item.symbol === "AAPL");
    const action = prepareStockDetailAction(found!.symbol, ["MSFT"]);
    const quote = await provider.getQuote(action!.symbol, "token");
    const [candles, research] = await Promise.all([provider.getCandles(action!.symbol, "token"), provider.getCompanyResearch(action!.symbol, "token")]);
    expect({ watchlist: action!.nextWatchlist, quote: quote.price, candles: candles.length, research: research.symbol }).toEqual({ watchlist: ["MSFT", "AAPL"], quote: 200, candles: 1, research: "AAPL" });
  });

  it("renders the right-header About entry and links all requested application information", () => {
    const app = readFileSync(new URL("../mobile/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('accessibilityLabel={ABOUT_ENTRY_LABEL}');
    expect(app).toContain('<AboutScreen onOpenSettings={() => navigateTo("settings")} />');
    expect(app).toContain("ABOUT_FEATURES.map");
    expect(app).toContain("ABOUT_NOTICE");
    expect(app).toContain("ABOUT_DEVELOPER");
    expect(app).toContain("ABOUT_TERMS");
  });

  it("applies narrow-screen constraints to the details header so names and prices cannot force horizontal overflow", () => {
    const app = readFileSync(new URL("../mobile/App.tsx", import.meta.url), "utf8");
    expect(app).toContain('import { QuoteDetailHeader } from "./src/components/QuoteDetailHeader"');
    expect(app).toContain("<QuoteDetailHeader title={selected?.displayName || selected?.symbol || \"未选择\"}");
  });
});
