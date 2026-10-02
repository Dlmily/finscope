import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, paperAccounts, paperHoldings, paperTrades, portfolioSnapshots, users, watchlistItems } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { validatePaperOrder } from "./trading";

let _db: ReturnType<typeof drizzle> | null = null;
const DEFAULT_INITIAL_CASH = 100000;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  (["name", "email", "loginMethod"] as const).forEach((field) => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getOrCreatePaperAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(paperAccounts).values({ userId, initialCash: String(DEFAULT_INITIAL_CASH), cash: String(DEFAULT_INITIAL_CASH) });
  const created = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).limit(1);
  if (!created[0]) throw new Error("Unable to initialize paper account");
  return created[0];
}

export async function resetPaperAccount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async (tx) => {
    await tx.delete(paperHoldings).where(eq(paperHoldings.userId, userId));
    await tx.delete(paperTrades).where(eq(paperTrades.userId, userId));
    await tx.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
    await tx.insert(paperAccounts).values({ userId, initialCash: String(DEFAULT_INITIAL_CASH), cash: String(DEFAULT_INITIAL_CASH) }).onDuplicateKeyUpdate({ set: { initialCash: String(DEFAULT_INITIAL_CASH), cash: String(DEFAULT_INITIAL_CASH) } });
  });
  return getOrCreatePaperAccount(userId);
}

export async function getPaperHoldings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(paperHoldings).where(eq(paperHoldings.userId, userId));
}

export async function getPaperTrades(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(paperTrades).where(eq(paperTrades.userId, userId)).orderBy(desc(paperTrades.executedAt)).limit(100);
}

export async function getPortfolioSnapshots(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId)).orderBy(portfolioSnapshots.capturedAt).limit(180);
}

export async function executePaperTrade(input: { userId: number; symbol: string; side: "BUY" | "SELL"; quantity: number; price: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async (tx) => {
    let [account] = await tx.select().from(paperAccounts).where(eq(paperAccounts.userId, input.userId)).limit(1);
    if (!account) {
      await tx.insert(paperAccounts).values({ userId: input.userId, initialCash: String(DEFAULT_INITIAL_CASH), cash: String(DEFAULT_INITIAL_CASH) });
      [account] = await tx.select().from(paperAccounts).where(eq(paperAccounts.userId, input.userId)).limit(1);
    }
    if (!account) throw new Error("Unable to create paper account");
    const [holding] = await tx.select().from(paperHoldings).where(and(eq(paperHoldings.userId, input.userId), eq(paperHoldings.symbol, input.symbol))).limit(1);
    const result = validatePaperOrder({ side: input.side, quantity: input.quantity, marketPrice: input.price, cash: Number(account.cash), holdingQuantity: holding?.quantity ?? 0, averageCost: Number(holding?.averageCost ?? 0) });
    await tx.update(paperAccounts).set({ cash: String(result.nextCash) }).where(eq(paperAccounts.userId, input.userId));
    if (result.nextQuantity === 0) {
      if (holding) await tx.delete(paperHoldings).where(eq(paperHoldings.id, holding.id));
    } else {
      await tx.insert(paperHoldings).values({ userId: input.userId, symbol: input.symbol, quantity: result.nextQuantity, averageCost: String(result.nextAverageCost) }).onDuplicateKeyUpdate({ set: { quantity: result.nextQuantity, averageCost: String(result.nextAverageCost) } });
    }
    await tx.insert(paperTrades).values({ userId: input.userId, symbol: input.symbol, side: input.side, quantity: input.quantity, price: String(input.price), gross: String(result.gross), realizedPnl: String(result.realizedPnl) });
    await tx.insert(portfolioSnapshots).values({ userId: input.userId, totalAssets: String(result.nextCash), cash: String(result.nextCash) });
    return result;
  });
}

export async function getWatchlist(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(watchlistItems).where(eq(watchlistItems.userId, userId)).orderBy(desc(watchlistItems.createdAt));
}

export async function addWatchlistItem(userId: number, symbol: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(watchlistItems).values({ userId, symbol }).onDuplicateKeyUpdate({ set: { symbol } });
}

export async function removeWatchlistItem(userId: number, symbol: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(watchlistItems).where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol)));
}
