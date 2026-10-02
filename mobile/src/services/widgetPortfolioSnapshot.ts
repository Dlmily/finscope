export type WidgetSnapshotPosition = {
  symbol: string;
  quantity: number;
  averageCost: number;
  lastPrice?: number;
  displayName?: string;
  currency?: "CNY" | "HKD" | "USD";
  market?: string;
  sourceId?: "TENCENT" | "TUSHARE" | "FINNHUB";
};
export type WidgetSnapshotQuote = { symbol: string; price: number; displayName?: string; currency?: "CNY" | "HKD" | "USD"; market?: string };
export type WidgetPortfolioSnapshot = { symbol: string; displayName: string; quantity: number; price: number; pnl: number; pnlPercent: number; currency: "CNY" | "HKD" | "USD"; market: string; sourceId: string; defaultQuantity: number; chartPoints: number[] };

export function buildWidgetPortfolioSnapshot(input: { positions: WidgetSnapshotPosition[]; quotes: WidgetSnapshotQuote[]; selectedSymbol?: string; intraday: number[]; candles: number[]; defaultQuantity: number }): WidgetPortfolioSnapshot | null {
  const position = input.positions.find((item) => item.symbol === input.selectedSymbol) ?? input.positions[0];
  if (!position) return null;
  const quote = input.quotes.find((item) => item.symbol === position.symbol);
  const price = quote?.price ?? position.lastPrice ?? position.averageCost;
  const chartSource = position.symbol === input.selectedSymbol ? (input.intraday.length ? input.intraday : input.candles) : [];
  const chartPoints = chartSource.filter((value) => Number.isFinite(value) && value > 0).slice(-32);
  if (chartPoints.length < 2) chartPoints.push(position.averageCost, price);
  const pnl = (price - position.averageCost) * position.quantity;
  const pnlPercent = position.averageCost ? (price - position.averageCost) / position.averageCost * 100 : 0;
  return { symbol: position.symbol, displayName: quote?.displayName ?? position.displayName ?? position.symbol, quantity: position.quantity, price, pnl, pnlPercent, currency: quote?.currency ?? position.currency ?? "CNY", market: quote?.market ?? position.market ?? "A_SHARE", sourceId: position.sourceId ?? (position.market === "US" ? "FINNHUB" : "TENCENT"), defaultQuantity: Math.max(1, Math.floor(input.defaultQuantity)), chartPoints };
}
