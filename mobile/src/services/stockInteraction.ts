export type QuoteLike = { symbol: string; price: number };
export type OrderSide = "BUY" | "SELL";

export function paperOrderPreflight(input: { side: OrderSide; quantity: number; quote?: QuoteLike; cash: number; holdingQuantity: number }) {
  if (!input.quote || !Number.isFinite(input.quote.price) || input.quote.price <= 0) return "missing-quote" as const;
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return "invalid-quantity" as const;
  if (input.side === "BUY" && input.quote.price * input.quantity > input.cash) return "insufficient-cash" as const;
  if (input.side === "SELL" && input.quantity > input.holdingQuantity) return "insufficient-holding" as const;
  return null;
}

export function prepareStockDetailAction(rawSymbol: string, watchlistSymbols: string[]) {
  const symbol = rawSymbol.trim().toUpperCase().slice(0, 30);
  if (!symbol) return null;
  return { symbol, nextWatchlist: watchlistSymbols.includes(symbol) ? watchlistSymbols : [...watchlistSymbols, symbol] };
}

export function resolveExecutableQuote<T extends QuoteLike>(quotes: T[], selected: T | undefined, symbol: string) {
  return quotes.find((quote) => quote.symbol === symbol) ?? (selected?.symbol === symbol ? selected : undefined);
}

/** 交易页打开委托弹窗时固定当前的可执行报价，避免后续导航状态更新影响订单。 */
export function createTradeModal<T extends QuoteLike>(side: OrderSide, selected: T | undefined, quotes: T[]) {
  const quote = selected ? resolveExecutableQuote(quotes, selected, selected.symbol) : undefined;
  return quote ? { side, symbol: quote.symbol, quote } : null;
}
