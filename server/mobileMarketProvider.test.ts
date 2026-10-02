import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeviceMarketProvider } from "../mobile/src/services/marketProvider";
import { aggregateCandles, movingAverage } from "../mobile/src/services/marketChart";
import { resolveSavedMarketSource } from "../mobile/src/services/marketSource";
import { beginLockedChartDrag, CHART_DRAG_CANCEL_DISTANCE_PX, CHART_LONG_PRESS_DELAY_MS, endLockedChartDrag, moveLockedChartDrag, resolveChartCursorIndex, shouldConsumeLockedChartMove, signedChange } from "../mobile/src/services/marketChartInteraction";

const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe("Tushare device-local market provider", () => {
  it("maps a domestic index quote into CNY with a stable change percentage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        fields: ["ts_code", "trade_date", "open", "high", "low", "close", "pre_close", "change", "pct_chg"],
        items: [["000001.SH", "20260826", 3888.1, 3910.2, 3860.4, 3900.5, 3882.0, 18.5, 0.48]],
      },
    })));
    global.fetch = fetchMock as typeof fetch;

    const quote = await getDeviceMarketProvider("TUSHARE").getQuote("000001.SH", "test-token");

    expect(quote).toMatchObject({ symbol: "000001.SH", displayName: "上证指数", currency: "CNY", market: "INDEX", assetType: "INDEX", price: 3900.5, change: 18.5, changePercent: 0.48 });
    expect(fetchMock).toHaveBeenCalledWith("https://api.tushare.pro", expect.objectContaining({ method: "POST" }));
  });

  it("reverses Tushare descending daily rows into chronological chart candles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        fields: ["trade_date", "open", "high", "low", "close", "vol"],
        items: [["20260826", 10.2, 10.8, 10.1, 10.6, 2200], ["20260825", 10.0, 10.3, 9.8, 10.2, 1100]],
      },
    })));
    global.fetch = fetchMock as typeof fetch;

    const candles = await getDeviceMarketProvider("TUSHARE").getCandles("600519.SH", "test-token", 30);

    expect(candles).toHaveLength(2);
    expect(candles[0]?.close).toBe(10.2);
    expect(candles[1]?.close).toBe(10.6);
    expect(candles[0]?.timestamp).toBeLessThan(candles[1]?.timestamp ?? 0);
    expect(candles[0]?.volume).toBe(1100);
  });

  it("returns local and provider matches when searching a Tushare domestic equity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { fields: ["ts_code", "name", "area", "industry"], items: [["000001.SZ", "平安银行", "深圳", "银行"]] } })));
    global.fetch = fetchMock as typeof fetch;

    const results = await getDeviceMarketProvider("TUSHARE").searchSymbols("平安银行", "test-token");

    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: "000001.SZ", description: "平安银行", assetType: "EQUITY" })]));
    expect(fetchMock).toHaveBeenCalledWith("https://api.tushare.pro", expect.objectContaining({ method: "POST" }));
  });
});

describe("Tencent public no-signup market provider", () => {
  it("maps a public A-share quote with price, change, day range and volume without a credential", async () => {
    const fields = Array.from({ length: 40 }, () => "");
    fields[1] = "TEST";
    fields[3] = "1302.80";
    fields[4] = "1304.00";
    fields[5] = "1300.00";
    fields[6] = "21731";
    fields[30] = "2026-08-26 15:00:00";
    fields[31] = "-1.20";
    fields[32] = "-0.09";
    fields[33] = "1310.00";
    fields[34] = "1295.00";
    fields[37] = "28123456";
    const fetchMock = vi.fn().mockResolvedValue(new Response(`v_sh600519="${fields.join("~")}";`));
    global.fetch = fetchMock as typeof fetch;

    const quote = await getDeviceMarketProvider("TENCENT").getQuote("600519.SH", "");

    expect(quote).toMatchObject({ symbol: "600519.SH", displayName: "TEST", currency: "CNY", market: "A_SHARE", price: 1302.8, previousClose: 1304, open: 1300, high: 1310, low: 1295, volume: 21731, amount: 28123456, change: -1.2, changePercent: -0.09 });
    expect(fetchMock).toHaveBeenCalledWith("https://qt.gtimg.cn/q=sh600519");
  });

  it("maps Tencent public daily rows into chronological chart candles without a credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        sh600519: {
          qfqday: [["2026-08-25", "10.00", "10.20", "10.30", "9.80", "1000"], ["2026-08-26", "10.20", "10.60", "10.80", "10.10", "1200"]],
        },
      },
    })));
    global.fetch = fetchMock as typeof fetch;

    const candles = await getDeviceMarketProvider("TENCENT").getCandles("600519.SH", "", 30);

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ open: 10, close: 10.2, high: 10.3, low: 9.8 });
    expect(candles[1]).toMatchObject({ open: 10.2, close: 10.6, high: 10.8, low: 10.1 });
    expect(candles[0]?.timestamp).toBeLessThan(candles[1]?.timestamp ?? 0);
    expect(candles[0]?.volume).toBe(1000);
  });

  it("maps Tencent public intraday minute rows into chronological chart points without a credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        sh600519: {
          data: { date: "20260826", data: ["0930 1300.00 176 22880000.00", "0931 1300.42 1102 143172830.07"] },
        },
      },
    })));
    global.fetch = fetchMock as typeof fetch;

    const points = await getDeviceMarketProvider("TENCENT").getIntraday?.("600519.SH", "");

    expect(points).toHaveLength(2);
    expect(points?.[0]).toMatchObject({ label: "0930", price: 1300, volume: 176, amount: 22880000 });
    expect(points?.[1]).toMatchObject({ label: "0931", price: 1300.42, volume: 1102, amount: 143172830.07 });
    expect(points?.[0]?.timestamp).toBeLessThan(points?.[1]?.timestamp ?? 0);
    expect(fetchMock).toHaveBeenCalledWith("https://ifzq.gtimg.cn/appstock/app/minute/query?code=sh600519");
  });

  it("finds curated public-market equities by both stock code and company name", async () => {
    const provider = getDeviceMarketProvider("TENCENT");
    await expect(provider.searchSymbols("600519", "")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ symbol: "600519.SH", description: "贵州茅台", assetType: "EQUITY" })]));
    await expect(provider.searchSymbols("平安银行", "")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ symbol: "000001.SZ", description: "平安银行", assetType: "EQUITY" })]));
  });
});

describe("saved device market source", () => {
  it("restores all supported sources and safely defaults unknown or legacy values to Tencent public quotes", () => {
    expect(resolveSavedMarketSource("TENCENT")).toBe("TENCENT");
    expect(resolveSavedMarketSource("TUSHARE")).toBe("TUSHARE");
    expect(resolveSavedMarketSource("FINNHUB")).toBe("FINNHUB");
    expect(resolveSavedMarketSource(null)).toBe("TENCENT");
    expect(resolveSavedMarketSource("UNKNOWN")).toBe("TENCENT");
  });
});

describe("Finnhub Candle provider", () => {
  it("uses the documented daily and 1-minute Candle resolutions for a Finnhub symbol", async () => {
    const payload = { s: "ok", t: [1787792400], o: [100], h: [104], l: [99], c: [102], v: [1200] };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload))));
    global.fetch = fetchMock as typeof fetch;
    const provider = getDeviceMarketProvider("FINNHUB");

    const [candles, intraday] = await Promise.all([provider.getCandles("AAPL", "test-key", 30), provider.getIntraday?.("AAPL", "test-key")]);

    expect(candles[0]).toMatchObject({ open: 100, high: 104, low: 99, close: 102, volume: 1200 });
    expect(intraday?.[0]).toMatchObject({ price: 102, volume: 1200 });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([expect.stringContaining("symbol=AAPL&resolution=D"), expect.stringContaining("symbol=AAPL&resolution=1")]));
  });

  it("surfaces Finnhub Candle entitlement and no-data payloads instead of silently returning an empty chart", async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ s: "no_data" })))) as typeof fetch;
    await expect(getDeviceMarketProvider("FINNHUB").getCandles("AAPL", "test-key")).rejects.toThrow("Finnhub 日线数据不可用");
    await expect(getDeviceMarketProvider("FINNHUB").getIntraday?.("AAPL", "test-key")).rejects.toThrow("Finnhub 1 分钟数据不可用");
  });

  it("maps Finnhub search results into selectable stock entries", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [{ symbol: "AAPL", displaySymbol: "AAPL", description: "Apple Inc", type: "Common Stock" }] }))) as typeof fetch;
    await expect(getDeviceMarketProvider("FINNHUB").searchSymbols("apple", "test-key")).resolves.toEqual([expect.objectContaining({ symbol: "AAPL", displaySymbol: "AAPL", description: "Apple Inc", market: "US", assetType: "EQUITY" })]);
  });
});

describe("K-line calculations", () => {
  it("aggregates daily candles into calendar weeks and derives MA values from real closing prices", () => {
    const candles = [
      { timestamp: 1766367600, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      { timestamp: 1766454000, open: 10.5, high: 12, low: 10, close: 11.5, volume: 150 },
      { timestamp: 1766972400, open: 11, high: 13, low: 10.5, close: 12.5, volume: 200 },
    ];
    const weekly = aggregateCandles(candles, "WEEK");
    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toMatchObject({ open: 10, high: 12, low: 9, close: 11.5, volume: 250 });
    expect(movingAverage(candles, 2)).toEqual([null, 11, 12]);
  });

  it("maps chart touch coordinates to nearest data points and bounds edge touches", () => {
    expect(resolveChartCursorIndex(40, 40, 400, 5)).toBe(0);
    expect(resolveChartCursorIndex(240, 40, 400, 5)).toBe(2);
    expect(resolveChartCursorIndex(999, 40, 400, 5)).toBe(4);
    expect(resolveChartCursorIndex(-20, 40, 400, 5)).toBe(0);
    expect(signedChange(102, 100)).toEqual({ value: 2, percent: 2 });
  });

  it("defines the two-stage cursor contract: 180ms long press, small drag tolerance, then native move ownership", () => {
    expect(CHART_LONG_PRESS_DELAY_MS).toBe(180);
    expect(CHART_DRAG_CANCEL_DISTANCE_PX).toBe(6);
    expect(shouldConsumeLockedChartMove(false, "move")).toBe(false);
    expect(shouldConsumeLockedChartMove(true, "move")).toBe(true);
    expect(shouldConsumeLockedChartMove(true, "up")).toBe(false);
    expect(shouldConsumeLockedChartMove(true, "cancel")).toBe(false);
  });

  it("keeps chart scroll offset fixed while a locked cursor moves and clears the cursor on release", () => {
    const started = beginLockedChartDrag(120, 60, 40, 400, 5);
    expect(started).toEqual({ locked: true, fixedScrollOffset: 120, cursorIndex: 1 });

    const movedLeft = moveLockedChartDrag(started, 0, 40, 400, 5);
    const movedRight = moveLockedChartDrag(movedLeft, 260, 40, 400, 5);
    expect(movedLeft).toMatchObject({ locked: true, fixedScrollOffset: 120, cursorIndex: 1 });
    expect(movedRight).toMatchObject({ locked: true, fixedScrollOffset: 120, cursorIndex: 3 });
    expect(endLockedChartDrag(movedRight)).toEqual({ locked: false, fixedScrollOffset: 120, cursorIndex: null });
  });
});
