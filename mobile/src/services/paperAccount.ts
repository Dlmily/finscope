import { nextAShareSellableAt, type BuyLock, type TradingMarket } from "./marketTradingRules";

export type AccountCurrency = "CNY" | "HKD" | "USD";
export type AccountSourceId = "TENCENT" | "TUSHARE" | "FINNHUB";
export type AccountPositionMark = { symbol: string; quantity: number; averageCost: number; lastPrice?: number; lastPriceTimestamp?: number; displayName?: string; currency?: AccountCurrency; market?: TradingMarket; sourceId?: AccountSourceId; buyLocks?: BuyLock[] };
export type AccountQuoteMark = { symbol: string; price: number; previousClose?: number; timestamp?: number; displayName?: string; currency?: AccountCurrency; market?: TradingMarket };
export type AccountTradeQuote = { symbol: string; price: number; assetType?: "EQUITY" | "INDEX" };
export type LocalPaperTrade = { id: string; side: "BUY" | "SELL"; symbol: string; quantity: number; price: number; realizedPnl: number; executedAt: number; displayName?: string; currency?: AccountCurrency; market?: TradingMarket; sourceId?: AccountSourceId };
export type LocalPaperAccount = { cash: number; positions: AccountPositionMark[]; trades: LocalPaperTrade[] };

function validPrice(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

/** 默认优先选择初始虚拟资金可按 100 股买入的股票，而非市场指数。 */
export function preferredTradeSymbol(quotes: AccountTradeQuote[], cash: number, boardLot = 100) {
  const affordableEquity = quotes.find((quote) => quote.assetType === "EQUITY" && validPrice(quote.price) && quote.price * boardLot <= cash);
  return affordableEquity?.symbol ?? quotes.find((quote) => quote.assetType === "EQUITY" && validPrice(quote.price))?.symbol ?? quotes.find((quote) => validPrice(quote.price))?.symbol;
}

/** 将已通过预检的本地模拟订单写入现金、持仓和成交流水。 */
export function applyLocalPaperOrder(account: LocalPaperAccount, order: { side: "BUY" | "SELL"; quantity: number; quote: AccountQuoteMark; id: string; executedAt: number; sourceId?: AccountSourceId; marketRulesEnabled?: boolean }): LocalPaperAccount {
  const existing = account.positions.find((position) => position.symbol === order.quote.symbol);
  const instrument = { displayName: order.quote.displayName ?? existing?.displayName, currency: order.quote.currency ?? existing?.currency, market: order.quote.market ?? existing?.market, sourceId: order.sourceId ?? existing?.sourceId };
  if (order.side === "BUY") {
    const gross = order.quote.price * order.quantity;
    const oldQuantity = existing?.quantity ?? 0;
    const nextQuantity = oldQuantity + order.quantity;
    const nextCost = ((existing?.averageCost ?? 0) * oldQuantity + gross) / nextQuantity;
    const nextLocks = order.marketRulesEnabled !== false && instrument.market === "A_SHARE"
      ? [...(existing?.buyLocks ?? []), { quantity: order.quantity, unlockAt: nextAShareSellableAt(order.executedAt) }]
      : existing?.buyLocks;
    const positions = existing
      ? account.positions.map((position) => position.symbol === order.quote.symbol ? { ...position, ...instrument, buyLocks: nextLocks, quantity: nextQuantity, averageCost: nextCost, lastPrice: order.quote.price, lastPriceTimestamp: order.quote.timestamp } : position)
      : [...account.positions, { symbol: order.quote.symbol, ...instrument, buyLocks: nextLocks, quantity: order.quantity, averageCost: order.quote.price, lastPrice: order.quote.price, lastPriceTimestamp: order.quote.timestamp }];
    return { cash: account.cash - gross, positions, trades: [{ id: order.id, side: "BUY", symbol: order.quote.symbol, ...instrument, quantity: order.quantity, price: order.quote.price, realizedPnl: 0, executedAt: order.executedAt }, ...account.trades] };
  }
  if (!existing) return account;
  const nextQuantity = existing.quantity - order.quantity;
  const realizedPnl = Number(((order.quote.price - existing.averageCost) * order.quantity).toFixed(2));
  const positions = nextQuantity
    ? account.positions.map((position) => position.symbol === order.quote.symbol ? { ...position, ...instrument, quantity: nextQuantity, lastPrice: order.quote.price, lastPriceTimestamp: order.quote.timestamp } : position)
    : account.positions.filter((position) => position.symbol !== order.quote.symbol);
  return { cash: account.cash + order.quote.price * order.quantity, positions, trades: [{ id: order.id, side: "SELL", symbol: order.quote.symbol, ...instrument, quantity: order.quantity, price: order.quote.price, realizedPnl, executedAt: order.executedAt }, ...account.trades] };
}

export function markedPrice(position: AccountPositionMark, quotes: AccountQuoteMark[]) {
  const quote = quotes.find((item) => item.symbol === position.symbol);
  if (validPrice(quote?.price)) return quote!.price;
  if (validPrice(position.lastPrice)) return position.lastPrice!;
  return position.averageCost;
}

export function mergePositionMarks<T extends AccountPositionMark>(positions: T[], quotes: AccountQuoteMark[]) {
  let changed = false;
  const next = positions.map((position) => {
    const quote = quotes.find((item) => item.symbol === position.symbol);
    if (!validPrice(quote?.price) || (position.lastPrice === quote!.price && position.lastPriceTimestamp === quote!.timestamp)) return position;
    changed = true;
    return { ...position, lastPrice: quote!.price, lastPriceTimestamp: quote!.timestamp };
  });
  return { positions: next, changed };
}

export function calculateAccountMetrics(initialCash: number, cash: number, positions: AccountPositionMark[], quotes: AccountQuoteMark[]) {
  const marketValue = positions.reduce((total, position) => total + markedPrice(position, quotes) * position.quantity, 0);
  const costBasis = positions.reduce((total, position) => total + position.averageCost * position.quantity, 0);
  const totalAssets = cash + marketValue;
  const returnAmount = totalAssets - initialCash;
  const returnPercent = initialCash ? (returnAmount / initialCash) * 100 : 0;
  const dailyMarks = positions.map((position) => {
    const quote = quotes.find((item) => item.symbol === position.symbol);
    return validPrice(quote?.price) && validPrice(quote?.previousClose) ? (quote!.price - quote!.previousClose!) * position.quantity : null;
  });
  const dayPnl = dailyMarks.some((value) => value !== null) ? dailyMarks.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
  return { marketValue, costBasis, totalAssets, returnAmount, returnPercent, unrealizedPnl: marketValue - costBasis, dayPnl };
}
