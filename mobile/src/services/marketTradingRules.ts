export type TradingMarket = "A_SHARE" | "HK" | "US" | "INDEX";

export type BuyLock = { quantity: number; unlockAt: number };
export type RuleAwarePosition = { quantity: number; market?: TradingMarket; buyLocks?: BuyLock[] };

export const MARKET_TRADING_RULES_STORAGE_KEY = "finscope-market-trading-rules-v1";
export const DEFAULT_MARKET_RULES_ENABLED = true;

/** 中国标准时间下一个工作日 09:30；本地测试不维护交易所节假日历。 */
export function nextAShareSellableAt(executedAt: number) {
  const china = new Date(executedAt + 8 * 60 * 60 * 1000);
  const unlock = new Date(Date.UTC(china.getUTCFullYear(), china.getUTCMonth(), china.getUTCDate() + 1, 1, 30, 0));
  while (unlock.getUTCDay() === 0 || unlock.getUTCDay() === 6) unlock.setUTCDate(unlock.getUTCDate() + 1);
  return unlock.getTime();
}

export function sellableQuantity(position: RuleAwarePosition, rulesEnabled: boolean, now = Date.now()) {
  if (!rulesEnabled || position.market !== "A_SHARE") return position.quantity;
  const locked = (position.buyLocks ?? []).reduce((total, lot) => total + (lot.unlockAt > now ? lot.quantity : 0), 0);
  return Math.max(0, position.quantity - locked);
}

export function marketSellRuleError(position: RuleAwarePosition | undefined, quantity: number, rulesEnabled: boolean, now = Date.now()) {
  if (!position || !rulesEnabled || position.market !== "A_SHARE") return null;
  return quantity > sellableQuantity(position, rulesEnabled, now) ? "a-share-t1-lock" as const : null;
}

export function marketRuleSummary(enabled: boolean) {
  return enabled
    ? "规则已开启：A 股当日买入需至下一个工作日 09:30 后卖出；美股和港股允许当日买卖。交收周期及券商限制不由本地账户模拟。"
    : "规则已关闭：所有市场均允许买入后立即卖出，仅适用于本地测试账户。";
}
