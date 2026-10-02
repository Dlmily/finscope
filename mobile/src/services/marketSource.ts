import type { MarketSourceId } from "./marketProvider";

export function resolveSavedMarketSource(savedSource: string | null): MarketSourceId {
  if (savedSource === "TUSHARE" || savedSource === "FINNHUB") return savedSource;
  return "TENCENT";
}
