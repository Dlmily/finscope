import { describe, expect, it } from "vitest";

describe("Finnhub credentials", () => {
  it("retrieves a lightweight live quote with the configured server secret", async () => {
    const token = process.env.FINNHUB_API_KEY;
    expect(token, "FINNHUB_API_KEY must be configured").toBeTruthy();

    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(token!)}`,
      { signal: AbortSignal.timeout(12_000) },
    );

    expect(response.ok).toBe(true);
    const quote = (await response.json()) as { c?: unknown; d?: unknown };
    expect(typeof quote.c).toBe("number");
    expect(typeof quote.d).toBe("number");
  }, 15_000);
});
