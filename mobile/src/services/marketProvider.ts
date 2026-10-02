export type MarketSourceId = "TENCENT" | "TUSHARE" | "FINNHUB";
export type MarketCurrency = "CNY" | "HKD" | "USD";
export type MarketScope = "A_SHARE" | "HK" | "US" | "INDEX";
export type AssetType = "EQUITY" | "INDEX";

export type MarketQuote = {
  symbol: string;
  displayName: string;
  price: number;
  change: number;
  changePercent: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  volume?: number;
  amount?: number;
  timestamp: number;
  source: string;
  currency: MarketCurrency;
  market: MarketScope;
  assetType: AssetType;
};

export type MarketCandle = { close: number; open: number; high: number; low: number; volume?: number; timestamp: number };
export type MarketIntradayPoint = { price: number; volume?: number; amount?: number; timestamp: number; label: string };
export type SymbolSearchResult = { symbol: string; displaySymbol: string; description: string; type: string; market: MarketScope; currency: MarketCurrency; assetType: AssetType };
export type CredentialHelp = { registrationUrl: string; credentialGuideUrl?: string; registrationLabel: string; credentialGuideLabel?: string };

export type CompanyResearchData = {
  symbol: string;
  profile: { name: string; description: string | null; descriptionSource: string | null; exchange: string | null; industry: string | null; country: string | null; webUrl: string | null; marketCapitalization: number | null };
  metrics: { peTtm: number | null; netProfitMarginTtm: number | null; week52High: number | null; week52Low: number | null };
  news: Array<{ id: number; headline: string; summary: string; source: string; publishedAt: number | null; url: string }>;
  source: string;
  refreshedAt: number;
};

export type DeviceMarketProvider = {
  id: MarketSourceId;
  label: string;
  keyLabel: string;
  requiresCredential: boolean;
  credentialHelp?: CredentialHelp;
  documentationStatus: "official-documentation" | "observed-public-response";
  defaultSymbols: string[];
  validationSymbol: string;
  getQuote(symbol: string, credential: string): Promise<MarketQuote>;
  getCandles(symbol: string, credential: string, days?: number): Promise<MarketCandle[]>;
  getIntraday?(symbol: string, credential: string): Promise<MarketIntradayPoint[]>;
  searchSymbols(query: string, credential: string): Promise<SymbolSearchResult[]>;
  getCompanyResearch(symbol: string, credential: string): Promise<CompanyResearchData>;
};

type CuratedSymbol = { symbol: string; name: string; market: MarketScope; currency: MarketCurrency; assetType: AssetType; exchange: string };
type TushareResponse = { code?: number; msg?: string | null; data?: { fields?: string[]; items?: unknown[][] } };

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const TUSHARE_BASE_URL = "https://api.tushare.pro";
// 仅供内测：以下公开响应没有面向第三方的正式字段文档、SLA 或商业展示授权；不可视为稳定 API 契约。
const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";
const TENCENT_KLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
type FinnhubCandlePayload = { s?: string; c?: number[]; o?: number[]; h?: number[]; l?: number[]; t?: number[]; v?: number[]; error?: string; message?: string };

export const DOMESTIC_SYMBOLS: CuratedSymbol[] = [
  { symbol: "000001.SH", name: "上证指数", market: "INDEX", currency: "CNY", assetType: "INDEX", exchange: "SSE" },
  { symbol: "399001.SZ", name: "深证成指", market: "INDEX", currency: "CNY", assetType: "INDEX", exchange: "SZSE" },
  { symbol: "399006.SZ", name: "创业板指", market: "INDEX", currency: "CNY", assetType: "INDEX", exchange: "SZSE" },
  { symbol: "000001.SZ", name: "平安银行", market: "A_SHARE", currency: "CNY", assetType: "EQUITY", exchange: "SZSE" },
  { symbol: "600519.SH", name: "贵州茅台", market: "A_SHARE", currency: "CNY", assetType: "EQUITY", exchange: "SSE" },
  { symbol: "601318.SH", name: "中国平安", market: "A_SHARE", currency: "CNY", assetType: "EQUITY", exchange: "SSE" },
  { symbol: "300750.SZ", name: "宁德时代", market: "A_SHARE", currency: "CNY", assetType: "EQUITY", exchange: "SZSE" },
  { symbol: "00700.HK", name: "腾讯控股", market: "HK", currency: "HKD", assetType: "EQUITY", exchange: "HKEX" },
  { symbol: "09988.HK", name: "阿里巴巴-W", market: "HK", currency: "HKD", assetType: "EQUITY", exchange: "HKEX" },
  { symbol: "03690.HK", name: "美团-W", market: "HK", currency: "HKD", assetType: "EQUITY", exchange: "HKEX" },
];

const DEFAULT_DOMESTIC_SYMBOLS = ["000001.SZ", "000001.SH", "399001.SZ", "600519.SH", "601318.SH", "00700.HK"];
const toNumber = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
const toText = (value: unknown) => typeof value === "string" ? value : "";
const ymd = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");

function timestampFromTushare(value: unknown) {
  const raw = toText(value);
  if (/^\d{8}$/.test(raw)) return Math.floor(new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T15:00:00+08:00`).getTime() / 1000);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

function domesticDefinition(rawSymbol: string): CuratedSymbol | undefined {
  const symbol = rawSymbol.trim().toUpperCase();
  return DOMESTIC_SYMBOLS.find((item) => item.symbol === symbol);
}

function normalizeDomesticSymbol(value: string) {
  const raw = value.trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(raw) || /^\d{5}\.HK$/.test(raw)) return raw;
  if (/^\d{6}$/.test(raw)) {
    if (raw.startsWith("6")) return `${raw}.SH`;
    if (raw.startsWith("8") || raw.startsWith("4") || raw.startsWith("9")) return `${raw}.BJ`;
    return `${raw}.SZ`;
  }
  if (/^\d{5}$/.test(raw)) return `${raw}.HK`;
  return raw;
}

function scopeForSymbol(symbol: string): { market: MarketScope; currency: MarketCurrency; assetType: AssetType; exchange: string; name: string } {
  const saved = domesticDefinition(symbol);
  if (saved) return { market: saved.market, currency: saved.currency, assetType: saved.assetType, exchange: saved.exchange, name: saved.name };
  if (symbol.endsWith(".HK")) return { market: "HK", currency: "HKD", assetType: "EQUITY", exchange: "HKEX", name: symbol };
  return { market: "A_SHARE", currency: "CNY", assetType: "EQUITY", exchange: symbol.endsWith(".SH") ? "SSE" : symbol.endsWith(".BJ") ? "BSE" : "SZSE", name: symbol };
}

function tencentSymbol(rawSymbol: string) {
  const symbol = normalizeDomesticSymbol(rawSymbol);
  if (symbol.endsWith(".HK")) return `hk${symbol.slice(0, 5)}`;
  const [code, exchange] = symbol.split(".");
  if (exchange === "SH") return `sh${code}`;
  if (exchange === "SZ") return `sz${code}`;
  if (exchange === "BJ") return `bj${code}`;
  throw new Error(`${symbol} 暂不在当前免注册公开行情范围内`);
}

function timestampFromTencent(value: string) {
  const normalized = value.trim().replace("/", "-").replace("/", "-").replace(" ", "T");
  const timestamp = Date.parse(`${normalized}+08:00`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
}

function timestampFromTencentMinute(date: string, time: string) {
  const normalizedDate = date.replace(/\D/g, "");
  if (!/^\d{8}$/.test(normalizedDate) || !/^\d{4}$/.test(time)) return Math.floor(Date.now() / 1000);
  return Math.floor(new Date(`${normalizedDate.slice(0, 4)}-${normalizedDate.slice(4, 6)}-${normalizedDate.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+08:00`).getTime() / 1000);
}

async function tencentText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`公开行情请求失败（${response.status}）`);
  const bytes = await response.arrayBuffer();
  return new TextDecoder("gb18030").decode(bytes);
}

function quoteFromTencentPayload(rawSymbol: string, payload: string): MarketQuote {
  const symbol = normalizeDomesticSymbol(rawSymbol);
  const fields = payload.match(/="([\s\S]*)"/)?.[1]?.split("~") ?? [];
  const price = toNumber(fields[3]);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${symbol} 暂无可用公开行情`);
  const previousClose = toNumber(fields[4]);
  const open = toNumber(fields[5]);
  const change = Number.isFinite(toNumber(fields[31])) ? toNumber(fields[31]) : Number.isFinite(previousClose) ? price - previousClose : 0;
  const changePercent = Number.isFinite(toNumber(fields[32])) ? toNumber(fields[32]) : Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : 0;
  const scope = scopeForSymbol(symbol);
  const volume = toNumber(fields[6]);
  const amount = toNumber(fields[37]);
  return {
    symbol,
    displayName: fields[1] || scope.name,
    price,
    change,
    changePercent,
    open: Number.isFinite(open) ? open : undefined,
    high: Number.isFinite(toNumber(fields[33])) ? toNumber(fields[33]) : undefined,
    low: Number.isFinite(toNumber(fields[34])) ? toNumber(fields[34]) : undefined,
    previousClose: Number.isFinite(previousClose) ? previousClose : undefined,
    volume: Number.isFinite(volume) ? volume : undefined,
    amount: Number.isFinite(amount) ? amount : undefined,
    timestamp: timestampFromTencent(fields[30] || ""),
    source: "公开行情测试源 · 延时 · 未文档化",
    currency: scope.currency,
    market: scope.market,
    assetType: scope.assetType,
  };
}

type TencentMinutePayload = { data?: Record<string, { data?: { date?: string; data?: string[] } }> };

export function parseTencentMinutePayload(payload: TencentMinutePayload, providerSymbol: string): MarketIntradayPoint[] {
  const minuteData = payload.data?.[providerSymbol]?.data;
  const tradeDate = minuteData?.date ?? "";
  return (minuteData?.data ?? []).map((line) => {
    const [label, rawPrice, rawVolume, rawAmount] = line.split(/\s+/);
    const price = toNumber(rawPrice);
    return { label, price, volume: toNumber(rawVolume), amount: toNumber(rawAmount), timestamp: timestampFromTencentMinute(tradeDate, label) };
  }).filter((point) => Number.isFinite(point.price) && point.price > 0 && /^\d{4}$/.test(point.label));
}

async function tushareRequest(apiName: string, credential: string, params: Record<string, string> = {}, fields = "") {
  const response = await fetch(TUSHARE_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: apiName, token: credential, params, fields }),
  });
  if (!response.ok) throw new Error(`Tushare 请求失败（${response.status}）`);
  const payload = (await response.json()) as TushareResponse;
  if (payload.code !== 0) throw new Error(`Tushare ${payload.code === 2002 ? "权限不足" : "数据错误"}${payload.msg ? `：${payload.msg}` : ""}`);
  const names = payload.data?.fields ?? [];
  return (payload.data?.items ?? []).map((items) => Object.fromEntries(names.map((name, index) => [name, items[index]])));
}

function quoteFromDailyRow(symbol: string, row: Record<string, unknown>, source: string): MarketQuote {
  const scope = scopeForSymbol(symbol);
  const price = toNumber(row.close);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${symbol} 暂无可用行情`);
  const previousClose = toNumber(row.pre_close);
  const change = Number.isFinite(toNumber(row.change)) ? toNumber(row.change) : Number.isFinite(previousClose) ? price - previousClose : 0;
  const changePercent = Number.isFinite(toNumber(row.pct_chg)) ? toNumber(row.pct_chg) : Number.isFinite(previousClose) && previousClose !== 0 ? (change / previousClose) * 100 : 0;
  const open = toNumber(row.open);
  const high = toNumber(row.high);
  const low = toNumber(row.low);
  const volume = toNumber(row.vol);
  const amount = toNumber(row.amount);
  return { symbol, displayName: toText(row.name) || scope.name, price, change, changePercent, open: Number.isFinite(open) ? open : undefined, high: Number.isFinite(high) ? high : undefined, low: Number.isFinite(low) ? low : undefined, previousClose: Number.isFinite(previousClose) ? previousClose : undefined, volume: Number.isFinite(volume) ? volume : undefined, amount: Number.isFinite(amount) ? amount : undefined, timestamp: timestampFromTushare(row.trade_time || row.trade_date), source, currency: scope.currency, market: scope.market, assetType: scope.assetType };
}

async function tushareDailyRows(symbol: string, days: number) {
  const scope = scopeForSymbol(symbol);
  const startDate = ymd(new Date(Date.now() - Math.max(days, 8) * 24 * 60 * 60 * 1000));
  const fields = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount";
  const apiName = scope.market === "HK" ? "hk_daily" : scope.assetType === "INDEX" ? "index_daily" : "daily";
  return tushareRequest(apiName, "", { ts_code: symbol, start_date: startDate }, fields);
}

function finnhubMinuteLabel(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(timestamp * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("hour")}${value("minute")}`;
}

async function finnhubCandleRequest(symbol: string, credential: string, resolution: "1" | "D", from: number, to: number) {
  const response = await fetch(`${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${encodeURIComponent(credential)}`);
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403 ? "当前 Key 未获 Candle 权限" : response.status === 429 ? "请求频率超过 Finnhub 限额" : `请求失败（${response.status}）`;
    throw new Error(`Finnhub ${resolution === "1" ? "1 分钟" : "日线"}数据${reason}`);
  }
  const data = (await response.json()) as FinnhubCandlePayload;
  if (data.s !== "ok" || !data.c || !data.o || !data.h || !data.l || !data.t) {
    const detail = typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : data.s === "no_data" ? "当前市场休市、标的未覆盖或套餐不含该周期" : "当前 Key 未获 Candle 权限或供应商未返回数据";
    throw new Error(`Finnhub ${resolution === "1" ? "1 分钟" : "日线"}数据不可用：${detail}`);
  }
  return data as Required<Pick<FinnhubCandlePayload, "c" | "o" | "h" | "l" | "t">> & FinnhubCandlePayload;
}

const tushareProvider: DeviceMarketProvider = {
  id: "TUSHARE",
  label: "Tushare Pro",
  keyLabel: "Tushare Token",
  requiresCredential: true,
  credentialHelp: { registrationUrl: "https://tushare.pro/weborder/", credentialGuideUrl: "https://tushare.pro/document/1?doc_id=39", registrationLabel: "注册 Tushare Pro", credentialGuideLabel: "查看 Token 获取说明" },
  documentationStatus: "official-documentation",
  defaultSymbols: DEFAULT_DOMESTIC_SYMBOLS,
  validationSymbol: "000001.SH",
  async getQuote(rawSymbol, credential) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const scope = scopeForSymbol(symbol);
    if (scope.market === "A_SHARE") {
      try {
        const rows = await tushareRequest("rt_k", credential, { ts_code: symbol }, "ts_code,name,pre_close,high,open,low,close,vol,amount,trade_time");
        if (rows[0]) return quoteFromDailyRow(symbol, rows[0], "Tushare · 实时日线");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("权限不足")) throw error;
      }
    }
    const startDate = ymd(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000));
    const apiName = scope.market === "HK" ? "hk_daily" : scope.assetType === "INDEX" ? "index_daily" : "daily";
    const rows = await tushareRequest(apiName, credential, { ts_code: symbol, start_date: startDate }, "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount");
    if (!rows[0]) throw new Error(`${symbol} 暂无可用行情或当前 Token 未获该接口权限`);
    return quoteFromDailyRow(symbol, rows[0], "Tushare · 最近日线");
  },
  async getCandles(rawSymbol, credential, days = 120) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const scope = scopeForSymbol(symbol);
    const startDate = ymd(new Date(Date.now() - Math.max(days + 14, 45) * 24 * 60 * 60 * 1000));
    const apiName = scope.market === "HK" ? "hk_daily" : scope.assetType === "INDEX" ? "index_daily" : "daily";
    const rows = await tushareRequest(apiName, credential, { ts_code: symbol, start_date: startDate }, "trade_date,open,high,low,close,vol");
    return rows.slice(0, days).reverse().map((row) => ({ timestamp: timestampFromTushare(row.trade_date), open: toNumber(row.open), high: toNumber(row.high), low: toNumber(row.low), close: toNumber(row.close), volume: toNumber(row.vol) })).filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0));
  },
  async searchSymbols(query, credential) {
    const keyword = query.trim();
    const normalized = normalizeDomesticSymbol(keyword);
    const curated = DOMESTIC_SYMBOLS.filter((item) => item.symbol.includes(normalized) || item.name.includes(keyword)).map((item) => ({ symbol: item.symbol, displaySymbol: item.symbol, description: item.name, type: item.assetType === "INDEX" ? "国内指数" : item.market === "HK" ? "港股" : "A股", market: item.market, currency: item.currency, assetType: item.assetType }));
    if (/^\d{5,6}\.(SH|SZ|BJ|HK)$/.test(normalized) && !curated.some((item) => item.symbol === normalized)) {
      const scope = scopeForSymbol(normalized);
      curated.unshift({ symbol: normalized, displaySymbol: normalized, description: "按代码载入的国内标的", type: scope.assetType === "INDEX" ? "国内指数" : scope.market === "HK" ? "港股" : "A股", market: scope.market, currency: scope.currency, assetType: scope.assetType });
    }
    try {
      const apiName = normalized.endsWith(".HK") ? "hk_basic" : "stock_basic";
      const rows = await tushareRequest(apiName, credential, normalized.endsWith(".HK") ? { list_status: "L" } : { exchange: "", list_status: "L" }, "ts_code,name,area,industry");
      const remote = rows.filter((row) => toText(row.ts_code).includes(normalized) || toText(row.name).includes(keyword)).slice(0, 12).map((row) => {
        const symbol = toText(row.ts_code);
        const scope = scopeForSymbol(symbol);
        return { symbol, displaySymbol: symbol, description: toText(row.name) || toText(row.industry) || "国内标的", type: scope.market === "HK" ? "港股" : "A股", market: scope.market, currency: scope.currency, assetType: scope.assetType };
      });
      return [...curated, ...remote.filter((item) => !curated.some((existing) => existing.symbol === item.symbol))].slice(0, 12);
    } catch {
      return curated.slice(0, 12);
    }
  },
  async getCompanyResearch(rawSymbol, credential) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const quote = await this.getQuote(symbol, credential);
    const scope = scopeForSymbol(symbol);
    return { symbol, profile: { name: quote.displayName, description: null, descriptionSource: null, exchange: scope.exchange, industry: null, country: scope.market === "HK" ? "Hong Kong, China" : "China", webUrl: null, marketCapitalization: null }, metrics: { peTtm: null, netProfitMarginTtm: null, week52High: null, week52Low: null }, news: [], source: quote.source, refreshedAt: Date.now() };
  },
};

const tencentProvider: DeviceMarketProvider = {
  id: "TENCENT",
  label: "公开行情测试源",
  keyLabel: "无需注册",
  requiresCredential: false,
  documentationStatus: "observed-public-response",
  defaultSymbols: DEFAULT_DOMESTIC_SYMBOLS,
  validationSymbol: "000001.SH",
  async getQuote(rawSymbol) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const raw = await tencentText(`${TENCENT_QUOTE_URL}${encodeURIComponent(tencentSymbol(symbol))}`);
    return quoteFromTencentPayload(symbol, raw);
  },
  async getCandles(rawSymbol, _credential, days = 120) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const providerSymbol = tencentSymbol(symbol);
    const response = await fetch(`${TENCENT_KLINE_URL}?param=${encodeURIComponent(`${providerSymbol},day,,,${Math.max(days, 8)},qfq`)}`);
    if (!response.ok) throw new Error(`公开日线请求失败（${response.status}）`);
    const data = (await response.json()) as { data?: Record<string, { qfqday?: unknown[][]; day?: unknown[][] }> };
    const rows = data.data?.[providerSymbol]?.qfqday ?? data.data?.[providerSymbol]?.day ?? [];
    return rows.map((row) => {
      const [date, open, close, high, low, volume] = row;
      return { timestamp: timestampFromTushare(date), open: toNumber(open), close: toNumber(close), high: toNumber(high), low: toNumber(low), volume: toNumber(volume) };
    }).filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0)).slice(-days);
  },
  async getIntraday(rawSymbol) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const providerSymbol = tencentSymbol(symbol);
    const response = await fetch(`https://ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(providerSymbol)}`);
    if (!response.ok) throw new Error(`公开分时请求失败（${response.status}）`);
    return parseTencentMinutePayload((await response.json()) as TencentMinutePayload, providerSymbol);
  },
  async searchSymbols(query) {
    const keyword = query.trim();
    const normalized = normalizeDomesticSymbol(keyword);
    const curated = DOMESTIC_SYMBOLS.filter((item) => item.symbol.includes(normalized) || item.name.includes(keyword)).map((item) => ({ symbol: item.symbol, displaySymbol: item.symbol, description: item.name, type: item.assetType === "INDEX" ? "国内指数" : item.market === "HK" ? "港股" : "A股", market: item.market, currency: item.currency, assetType: item.assetType }));
    if (/^\d{5,6}\.(SH|SZ|BJ|HK)$/.test(normalized) && !curated.some((item) => item.symbol === normalized)) {
      const scope = scopeForSymbol(normalized);
      curated.unshift({ symbol: normalized, displaySymbol: normalized, description: "按代码载入的国内标的", type: scope.assetType === "INDEX" ? "国内指数" : scope.market === "HK" ? "港股" : "A股", market: scope.market, currency: scope.currency, assetType: scope.assetType });
    }
    return curated.slice(0, 12);
  },
  async getCompanyResearch(rawSymbol, credential) {
    const symbol = normalizeDomesticSymbol(rawSymbol);
    const quote = await this.getQuote(symbol, credential);
    const scope = scopeForSymbol(symbol);
    return { symbol, profile: { name: quote.displayName, description: null, descriptionSource: null, exchange: scope.exchange, industry: null, country: scope.market === "HK" ? "Hong Kong, China" : "China", webUrl: null, marketCapitalization: null }, metrics: { peTtm: null, netProfitMarginTtm: null, week52High: null, week52Low: null }, news: [], source: quote.source, refreshedAt: Date.now() };
  },
};

const finnhubProvider: DeviceMarketProvider = {
  id: "FINNHUB",
  label: "Finnhub",
  keyLabel: "Finnhub API Key",
  requiresCredential: true,
  credentialHelp: { registrationUrl: "https://finnhub.io/register", credentialGuideUrl: "https://finnhub.io/docs/api/authentication", registrationLabel: "注册 Finnhub", credentialGuideLabel: "查看 API Key 获取说明" },
  documentationStatus: "official-documentation",
  defaultSymbols: ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "META"],
  validationSymbol: "AAPL",
  async getQuote(rawSymbol, credential) {
    const symbol = rawSymbol.trim().toUpperCase();
    const response = await fetch(`${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(credential)}`);
    if (!response.ok) throw new Error(`行情请求失败（${response.status}）`);
    const data = (await response.json()) as { c?: number; d?: number; dp?: number; h?: number; l?: number; pc?: number; t?: number };
    if (!data.c || !Number.isFinite(data.c)) throw new Error(`${symbol} 暂无可用行情`);
    return { symbol, displayName: symbol, price: data.c, change: data.d ?? 0, changePercent: data.dp ?? 0, high: data.h, low: data.l, previousClose: data.pc, timestamp: data.t ?? Math.floor(Date.now() / 1000), source: "Finnhub", currency: "USD", market: "US", assetType: "EQUITY" };
  },
  async getCandles(rawSymbol, credential, days = 120) {
    const symbol = rawSymbol.trim().toUpperCase();
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const data = await finnhubCandleRequest(symbol, credential, "D", from, to);
    return data.t.map((timestamp, index) => ({ timestamp, close: data.c?.[index] ?? 0, open: data.o?.[index] ?? 0, high: data.h?.[index] ?? 0, low: data.l?.[index] ?? 0, volume: data.v?.[index] })).filter((item) => item.close > 0);
  },
  async getIntraday(rawSymbol, credential) {
    const symbol = rawSymbol.trim().toUpperCase();
    const to = Math.floor(Date.now() / 1000);
    const from = to - 24 * 60 * 60;
    const data = await finnhubCandleRequest(symbol, credential, "1", from, to);
    return data.t.map((timestamp, index) => ({ timestamp, label: finnhubMinuteLabel(timestamp), price: data.c[index] ?? 0, volume: data.v?.[index] })).filter((point) => Number.isFinite(point.price) && point.price > 0);
  },
  async searchSymbols(query, credential) {
    const response = await fetch(`${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query.trim())}&token=${encodeURIComponent(credential)}`);
    if (!response.ok) throw new Error(`企业检索失败（${response.status}）`);
    const data = (await response.json()) as { result?: Array<{ description?: string; displaySymbol?: string; symbol?: string; type?: string }> };
    return (data.result ?? []).slice(0, 12).map((item) => ({ symbol: item.symbol ?? item.displaySymbol ?? "", displaySymbol: item.displaySymbol ?? item.symbol ?? "", description: item.description ?? "", type: item.type ?? "Equity", market: "US" as const, currency: "USD" as const, assetType: "EQUITY" as const })).filter((item) => item.symbol);
  },
  async getCompanyResearch(rawSymbol, credential) {
    const symbol = rawSymbol.trim().toUpperCase();
    const to = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    const request = async <T,>(path: string, params: Record<string, string> = {}) => {
      const url = new URL(`${FINNHUB_BASE_URL}${path}`);
      Object.entries({ ...params, token: credential }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`企业资料请求失败（${response.status}）`);
      return (await response.json()) as T;
    };
    const [profile, metrics, news] = await Promise.all([
      request<Record<string, unknown>>("/stock/profile2", { symbol }),
      request<{ metric?: Record<string, unknown> }>("/stock/metric", { symbol, metric: "all" }),
      request<Array<{ category?: string; datetime?: number; headline?: string; id?: number; source?: string; summary?: string; url?: string }>>("/company-news", { symbol, from: iso(from), to: iso(to) }),
    ]);
    const metric = metrics.metric ?? {};
    const profileName = typeof profile.name === "string" ? profile.name : symbol;
    let description = typeof profile.description === "string" && profile.description.trim() ? profile.description : null;
    let descriptionSource: string | null = description ? "Finnhub profile" : null;
    if (!description) {
      try {
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(profileName.replace(/\s+/g, "_"))}`, { headers: { Accept: "application/json" } });
        const summary = response.ok ? (await response.json()) as { extract?: unknown } : null;
        if (typeof summary?.extract === "string" && summary.extract.trim()) { description = summary.extract; descriptionSource = "Wikipedia public summary"; }
      } catch { /* Public summary is optional; retain structured provider fields below. */ }
    }
    return { symbol, profile: { name: profileName, description, descriptionSource, exchange: typeof profile.exchange === "string" ? profile.exchange : null, industry: typeof profile.finnhubIndustry === "string" ? profile.finnhubIndustry : null, country: typeof profile.country === "string" ? profile.country : null, webUrl: typeof profile.weburl === "string" ? profile.weburl : null, marketCapitalization: typeof profile.marketCapitalization === "number" ? profile.marketCapitalization : null }, metrics: { peTtm: typeof metric.peBasicExclExtraTTM === "number" ? metric.peBasicExclExtraTTM : null, netProfitMarginTtm: typeof metric.netProfitMarginTTM === "number" ? metric.netProfitMarginTTM : null, week52High: typeof metric["52WeekHigh"] === "number" ? metric["52WeekHigh"] : null, week52Low: typeof metric["52WeekLow"] === "number" ? metric["52WeekLow"] : null }, news: news.slice(0, 6).map((item) => ({ id: item.id ?? 0, headline: item.headline ?? "Untitled update", summary: item.summary ?? "", source: item.source ?? "Finnhub", publishedAt: item.datetime ? item.datetime * 1000 : null, url: item.url ?? "" })), source: "Finnhub", refreshedAt: Date.now() };
  },
};

const providers: Record<MarketSourceId, DeviceMarketProvider> = { TENCENT: tencentProvider, TUSHARE: tushareProvider, FINNHUB: finnhubProvider };

export function getDeviceMarketProvider(source: MarketSourceId = "TENCENT") {
  return providers[source];
}
