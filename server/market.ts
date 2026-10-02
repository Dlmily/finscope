import { resolveMarketSource, type MarketSourceId } from "./marketProvider";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type FinnhubCandle = {
  c?: number[];
  h?: number[];
  l?: number[];
  o?: number[];
  s?: string;
  t?: number[];
  v?: number[];
};

function getToken() {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY is not configured");
  return token;
}

async function finnhub<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${FINNHUB_BASE_URL}${path}`);
  Object.entries({ ...params, token: getToken() }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Market data request failed (${response.status})`);
  return (await response.json()) as T;
}

export function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 15);
}

async function finnhubGetQuote(rawSymbol: string) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) throw new Error("Invalid stock symbol");
  const quote = await finnhub<FinnhubQuote>("/quote", { symbol });

  if (!Number.isFinite(quote.c) || !quote.c) {
    throw new Error(`No quote available for ${symbol}`);
  }

  return {
    symbol,
    price: quote.c,
    change: quote.d ?? 0,
    changePercent: quote.dp ?? 0,
    open: quote.o ?? null,
    high: quote.h ?? null,
    low: quote.l ?? null,
    previousClose: quote.pc ?? null,
    marketTimestamp: quote.t ? new Date(quote.t * 1000) : null,
    source: "Finnhub",
    refreshedAt: new Date(),
  };
}

async function finnhubGetChart(rawSymbol: string, range: "1M" | "3M" | "1Y" = "1M") {
  const symbol = normalizeSymbol(rawSymbol);
  const now = Math.floor(Date.now() / 1000);
  const lookback: Record<typeof range, number> = { "1M": 35, "3M": 100, "1Y": 370 };
  const from = now - lookback[range] * 24 * 60 * 60;
  const candle = await finnhub<FinnhubCandle>("/stock/candle", { symbol, resolution: "D", from, to: now });

  if (candle.s !== "ok" || !candle.t || !candle.c || !candle.o || !candle.h || !candle.l) {
    return { symbol, points: [], source: "Finnhub", refreshedAt: new Date() };
  }

  return {
    symbol,
    points: candle.t.map((timestamp, index) => ({
      timestamp: new Date(timestamp * 1000),
      open: candle.o?.[index] ?? null,
      high: candle.h?.[index] ?? null,
      low: candle.l?.[index] ?? null,
      close: candle.c?.[index] ?? null,
      volume: candle.v?.[index] ?? null,
    })),
    source: "Finnhub",
    refreshedAt: new Date(),
  };
}

async function finnhubSearchSymbols(query: string) {
  const normalized = query.trim().slice(0, 80);
  if (!normalized) return [];
  const result = await finnhub<{ result?: Array<{ description?: string; displaySymbol?: string; symbol?: string; type?: string }> }>("/search", { q: normalized });
  return (result.result ?? []).slice(0, 12).map((item) => ({
    symbol: item.symbol ?? item.displaySymbol ?? "",
    displaySymbol: item.displaySymbol ?? item.symbol ?? "",
    description: item.description ?? "",
    type: item.type ?? "Equity",
  })).filter((item) => item.symbol);
}

async function finnhubGetCompanyResearch(rawSymbol: string) {
  const symbol = normalizeSymbol(rawSymbol);
  const [quote, profile, metrics, news] = await Promise.all([
    finnhubGetQuote(symbol),
    finnhub<Record<string, unknown>>("/stock/profile2", { symbol }),
    finnhub<{ metric?: Record<string, unknown> }>("/stock/metric", { symbol, metric: "all" }),
    finnhubGetCompanyNews(symbol),
  ]);

  const metric = metrics.metric ?? {};
  return {
    quote,
    profile: {
      name: String(profile.name ?? symbol),
      description: (() => {
        if (profile.description) return String(profile.description);
        const name = String(profile.name ?? symbol);
        const facts = [
          profile.finnhubIndustry ? `所属行业为${String(profile.finnhubIndustry)}` : null,
          profile.exchange ? `上市交易所为${String(profile.exchange)}` : null,
          profile.country ? `公开资料标注国家/地区为${String(profile.country)}` : null,
          profile.weburl ? `公司网站为${String(profile.weburl)}` : null,
        ].filter((item): item is string => Boolean(item));
        return facts.length ? `${name} 的公开资料摘要：${facts.join("；")}。` : null;
      })(),
      ticker: String(profile.ticker ?? symbol),
      exchange: profile.exchange ? String(profile.exchange) : null,
      country: profile.country ? String(profile.country) : null,
      currency: profile.currency ? String(profile.currency) : null,
      industry: profile.finnhubIndustry ? String(profile.finnhubIndustry) : null,
      ipo: profile.ipo ? String(profile.ipo) : null,
      logo: profile.logo ? String(profile.logo) : null,
      weburl: profile.weburl ? String(profile.weburl) : null,
      marketCapitalization: typeof profile.marketCapitalization === "number" ? profile.marketCapitalization : null,
      shareOutstanding: typeof profile.shareOutstanding === "number" ? profile.shareOutstanding : null,
    },
    metrics: {
      peBasicExclExtraTTM: metric.peBasicExclExtraTTM ?? null,
      epsBasicExclExtraItemsTTM: metric.epsBasicExclExtraItemsTTM ?? null,
      dividendYieldIndicatedAnnual: metric.dividendYieldIndicatedAnnual ?? null,
      revenuePerShareTTM: metric.revenuePerShareTTM ?? null,
      netProfitMarginTTM: metric.netProfitMarginTTM ?? null,
      debtToEquityAnnual: metric.totalDebt2TotalEquityAnnual ?? null,
      "52WeekHigh": metric["52WeekHigh"] ?? null,
      "52WeekLow": metric["52WeekLow"] ?? null,
    },
    news,
    source: "Finnhub",
    refreshedAt: new Date(),
  };
}

async function finnhubGetCompanyNews(rawSymbol: string) {
  const symbol = normalizeSymbol(rawSymbol);
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const result = await finnhub<Array<{ category?: string; datetime?: number; headline?: string; id?: number; image?: string; source?: string; summary?: string; url?: string }>>("/company-news", {
    symbol,
    from: iso(from),
    to: iso(to),
  });

  return result.slice(0, 20).map((item) => ({
    id: item.id ?? Math.round(Math.random() * 1_000_000),
    category: item.category ?? "Company",
    publishedAt: item.datetime ? new Date(item.datetime * 1000) : null,
    headline: item.headline ?? "Untitled update",
    source: item.source ?? "Finnhub",
    summary: item.summary ?? "",
    url: item.url ?? "",
  }));
}

async function finnhubGetMarketOverview() {
  const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "META"];
  const results = await Promise.allSettled(symbols.map((symbol) => finnhubGetQuote(symbol)));
  return results
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof finnhubGetQuote>>> => result.status === "fulfilled")
    .map((result) => result.value);
}

const marketProviders = {
  FINNHUB: {
    getQuote: finnhubGetQuote,
    getChart: finnhubGetChart,
    searchSymbols: finnhubSearchSymbols,
    getCompanyResearch: finnhubGetCompanyResearch,
    getCompanyNews: finnhubGetCompanyNews,
    getMarketOverview: finnhubGetMarketOverview,
  },
} as const;

function providerFor(source?: MarketSourceId) {
  return marketProviders[resolveMarketSource(source)];
}

export function getQuote(rawSymbol: string, source?: MarketSourceId) {
  return providerFor(source).getQuote(rawSymbol);
}

export function getChart(rawSymbol: string, range: "1M" | "3M" | "1Y" = "1M", source?: MarketSourceId) {
  return providerFor(source).getChart(rawSymbol, range);
}

export function searchSymbols(query: string, source?: MarketSourceId) {
  return providerFor(source).searchSymbols(query);
}

export function getCompanyResearch(rawSymbol: string, source?: MarketSourceId) {
  return providerFor(source).getCompanyResearch(rawSymbol);
}

export function getCompanyNews(rawSymbol: string, source?: MarketSourceId) {
  return providerFor(source).getCompanyNews(rawSymbol);
}

export function getMarketOverview(source?: MarketSourceId) {
  return providerFor(source).getMarketOverview();
}
