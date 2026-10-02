export type PaperOrder = {
  side: "BUY" | "SELL";
  quantity: number;
  marketPrice: number;
  cash: number;
  holdingQuantity: number;
  averageCost: number;
};

export type PaperOrderResult = {
  gross: number;
  nextCash: number;
  nextQuantity: number;
  nextAverageCost: number;
  realizedPnl: number;
};

export function validatePaperOrder(input: PaperOrder): PaperOrderResult {
  const { side, quantity, marketPrice, cash, holdingQuantity, averageCost } = input;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number");
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) throw new Error("A valid live market price is required");
  if (!Number.isFinite(cash) || cash < 0) throw new Error("Cash balance is invalid");

  const gross = Number((quantity * marketPrice).toFixed(2));
  if (side === "BUY") {
    if (gross > cash + 0.00001) throw new Error("Insufficient virtual cash");
    const nextQuantity = holdingQuantity + quantity;
    const nextAverageCost = nextQuantity ? Number((((holdingQuantity * averageCost) + gross) / nextQuantity).toFixed(4)) : 0;
    return { gross, nextCash: Number((cash - gross).toFixed(2)), nextQuantity, nextAverageCost, realizedPnl: 0 };
  }

  if (quantity > holdingQuantity) throw new Error("Insufficient virtual position");
  const nextQuantity = holdingQuantity - quantity;
  return {
    gross,
    nextCash: Number((cash + gross).toFixed(2)),
    nextQuantity,
    nextAverageCost: nextQuantity ? averageCost : 0,
    realizedPnl: Number(((marketPrice - averageCost) * quantity).toFixed(2)),
  };
}
