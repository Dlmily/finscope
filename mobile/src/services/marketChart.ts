import type { MarketCandle } from "./marketProvider";

export type KlineInterval = "DAY" | "WEEK" | "MONTH";

function periodKey(candle: MarketCandle, interval: KlineInterval) {
  const date = new Date(candle.timestamp * 1000);
  if (interval === "MONTH") return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
  if (interval === "WEEK") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start.toISOString().slice(0, 10);
  }
  return String(candle.timestamp);
}

export function aggregateCandles(candles: MarketCandle[], interval: KlineInterval): MarketCandle[] {
  if (interval === "DAY") return candles;
  return candles.reduce<MarketCandle[]>((groups, candle) => {
    const previous = groups[groups.length - 1];
    if (!previous || periodKey(previous, interval) !== periodKey(candle, interval)) {
      groups.push({ ...candle });
      return groups;
    }
    previous.high = Math.max(previous.high, candle.high);
    previous.low = Math.min(previous.low, candle.low);
    previous.close = candle.close;
    previous.timestamp = candle.timestamp;
    previous.volume = (previous.volume ?? 0) + (candle.volume ?? 0);
    return groups;
  }, []);
}

export function movingAverage(candles: MarketCandle[], period: number): Array<number | null> {
  return candles.map((_, index) => {
    if (index < period - 1) return null;
    const slice = candles.slice(index - period + 1, index + 1);
    return slice.reduce((total, candle) => total + candle.close, 0) / period;
  });
}
