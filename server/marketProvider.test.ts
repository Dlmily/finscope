import { describe, expect, it } from "vitest";
import { getMarketSource, listMarketSources, resolveMarketSource } from "./marketProvider";
import { getCompanyResearch, getQuote, searchSymbols } from "./market";

describe("market provider registry", () => {
  it("exposes only an active, disclosed provider", () => {
    expect(listMarketSources()).toEqual([
      expect.objectContaining({
        id: "FINNHUB",
        label: "Finnhub",
        status: "ACTIVE",
        credentialMode: "SERVER_DEFAULT_OR_DEVICE_KEY",
      }),
    ]);
  });

  it("normalizes the current provider and rejects undeclared providers", () => {
    expect(resolveMarketSource(" finnhub ")).toBe("FINNHUB");
    expect(getMarketSource().supports).toContain("QUOTE");
    expect(() => resolveMarketSource("BAIDU_INTERNAL")).toThrow("Unsupported market data source");
  });

  it("routes a quote request through the selected provider", async () => {
    const quote = await getQuote("AAPL", "FINNHUB");
    expect(quote.source).toBe("Finnhub");
    expect(quote.symbol).toBe("AAPL");
  }, 15_000);

  it("routes company research through the selected provider", async () => {
    const research = await getCompanyResearch("AAPL", "FINNHUB");
    expect(research.source).toBe("Finnhub");
    expect(research.profile.ticker).toBe("AAPL");
    expect(Array.isArray(research.news)).toBe(true);
  }, 15_000);

  it("returns public symbol search matches through the selected provider", async () => {
    const matches = await searchSymbols("Apple", "FINNHUB");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((item) => item.symbol === "AAPL")).toBe(true);
  }, 15_000);
});
