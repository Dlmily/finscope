import { describe, expect, it } from "vitest";
import { paginateTradeHistory, TRADE_HISTORY_PAGE_SIZE } from "../mobile/src/services/tradeHistoryPagination";

describe("trade history pagination", () => {
  it("returns exactly seven entries per page and clamps an out-of-range page", () => {
    const entries = Array.from({ length: 15 }, (_, index) => index + 1);
    expect(TRADE_HISTORY_PAGE_SIZE).toBe(7);
    expect(paginateTradeHistory(entries, 1)).toMatchObject({ page: 1, totalPages: 3, entries: [1, 2, 3, 4, 5, 6, 7] });
    expect(paginateTradeHistory(entries, 2).entries).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(paginateTradeHistory(entries, 99)).toMatchObject({ page: 3, totalPages: 3, entries: [15] });
  });
});
