export const TRADE_HISTORY_PAGE_SIZE = 7;

export function paginateTradeHistory<T>(entries: T[], requestedPage: number, pageSize = TRADE_HISTORY_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return { page, totalPages, entries: entries.slice(start, start + pageSize) };
}
