export type PortfolioRefreshContext = {
  activeTab: "watchlist" | "market" | "news" | "research" | "trade" | "settings" | "about";
  foregroundRefreshVersion: number;
  hasApiKey: boolean;
  hasPositions: boolean;
  providerRequiresCredential: boolean;
  sourceHydrated: boolean;
  storageReady: boolean;
};

export type PortfolioQuoteRefreshStatus = "idle" | "refreshing" | "updated" | "partial" | "no-quote" | "failed";

/** 仅在已就绪的前台场景刷新持仓报价；不会创建后台定时任务。 */
export function shouldRefreshPortfolioQuotes(context: PortfolioRefreshContext) {
  if (!context.storageReady || !context.sourceHydrated || !context.hasPositions) return false;
  if (context.providerRequiresCredential && !context.hasApiKey) return false;
  return context.activeTab === "trade" || context.foregroundRefreshVersion > 0;
}

export function resolvePortfolioQuoteRefreshStatus(positionSymbols: string[], quoteSymbols: string[]): Exclude<PortfolioQuoteRefreshStatus, "idle" | "refreshing" | "failed"> {
  if (!positionSymbols.length) return "updated";
  const available = new Set(quoteSymbols);
  const coveredCount = positionSymbols.filter((symbol) => available.has(symbol)).length;
  if (!coveredCount) return "no-quote";
  return coveredCount === positionSymbols.length ? "updated" : "partial";
}

export function getPortfolioQuoteRefreshFeedback(status: PortfolioQuoteRefreshStatus, lastSuccessfulRefreshAt: number | null, formatTime: (value: number) => string) {
  if (status === "refreshing") return { copy: "正在刷新持仓报价…", tone: "muted" as const };
  if (status === "updated") return { copy: `最近成功刷新：${lastSuccessfulRefreshAt ? formatTime(lastSuccessfulRefreshAt) : "刚刚"}`, tone: "muted" as const };
  if (status === "partial") return { copy: "部分持仓已按当前报价更新；其余保留最近有效标记。", tone: "warning" as const };
  if (status === "no-quote") return { copy: "当前数据源未返回任一持仓报价；市值保留最近有效标记。", tone: "error" as const };
  if (status === "failed") return { copy: "自动刷新暂未成功；市值保留最近有效标记，可手动重试。", tone: "error" as const };
  return { copy: "进入持仓页后将自动刷新报价。", tone: "muted" as const };
}
