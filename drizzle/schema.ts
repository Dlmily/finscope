import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const paperAccounts = mysqlTable("paperAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  initialCash: decimal("initialCash", { precision: 14, scale: 2 }).notNull().default("100000.00"),
  cash: decimal("cash", { precision: 14, scale: 2 }).notNull().default("100000.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const paperHoldings = mysqlTable("paperHoldings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  quantity: int("quantity").notNull(),
  averageCost: decimal("averageCost", { precision: 14, scale: 4 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [unique("paper_holdings_user_symbol").on(table.userId, table.symbol)]);

export const paperTrades = mysqlTable("paperTrades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  side: mysqlEnum("side", ["BUY", "SELL"]).notNull(),
  quantity: int("quantity").notNull(),
  price: decimal("price", { precision: 14, scale: 4 }).notNull(),
  gross: decimal("gross", { precision: 14, scale: 2 }).notNull(),
  realizedPnl: decimal("realizedPnl", { precision: 14, scale: 2 }).notNull().default("0.00"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});

export const watchlistItems = mysqlTable("watchlistItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [unique("watchlist_user_symbol").on(table.userId, table.symbol)]);

export const portfolioSnapshots = mysqlTable("portfolioSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  totalAssets: decimal("totalAssets", { precision: 14, scale: 2 }).notNull(),
  cash: decimal("cash", { precision: 14, scale: 2 }).notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});
