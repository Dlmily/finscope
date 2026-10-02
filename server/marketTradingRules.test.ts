import { describe, expect, it } from "vitest";
import { applyLocalPaperOrder } from "../mobile/src/services/paperAccount";
import { marketRuleSummary, marketSellRuleError, nextAShareSellableAt, sellableQuantity } from "../mobile/src/services/marketTradingRules";

describe("market trading rules", () => {
  const boughtAt = Date.UTC(2026, 7, 27, 2, 0, 0);

  it("locks newly bought A shares until the next China business-day market opening when rules are on", () => {
    const unlockAt = nextAShareSellableAt(boughtAt);
    expect(unlockAt).toBe(Date.UTC(2026, 7, 28, 1, 30, 0));
    const position = { quantity: 100, market: "A_SHARE" as const, buyLocks: [{ quantity: 100, unlockAt }] };
    expect(sellableQuantity(position, true, boughtAt + 60_000)).toBe(0);
    expect(marketSellRuleError(position, 1, true, boughtAt + 60_000)).toBe("a-share-t1-lock");
    expect(sellableQuantity(position, false, boughtAt + 60_000)).toBe(100);
    expect(sellableQuantity(position, true, unlockAt)).toBe(100);
  });

  it("keeps US and HK holdings sellable on the purchase day while rules are enabled", () => {
    expect(sellableQuantity({ quantity: 10, market: "US" }, true, boughtAt)).toBe(10);
    expect(sellableQuantity({ quantity: 10, market: "HK" }, true, boughtAt)).toBe(10);
  });

  it("persists the source, market and A-share lock with a purchase for future cross-source operations", () => {
    const account = applyLocalPaperOrder({ cash: 10_000, positions: [], trades: [] }, { side: "BUY", quantity: 100, quote: { symbol: "000001.SZ", price: 10, displayName: "平安银行", currency: "CNY", market: "A_SHARE", timestamp: boughtAt / 1000 }, id: "rule-fill", executedAt: boughtAt, sourceId: "TENCENT", marketRulesEnabled: true });
    expect(account.positions[0]).toMatchObject({ sourceId: "TENCENT", market: "A_SHARE", buyLocks: [{ quantity: 100 }] });
    expect(account.trades[0]).toMatchObject({ sourceId: "TENCENT", market: "A_SHARE" });
    expect(marketRuleSummary(false)).toContain("立即卖出");
  });
});
