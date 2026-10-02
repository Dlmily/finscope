import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { getChart, getCompanyNews, getCompanyResearch, getMarketOverview, getQuote, normalizeSymbol, searchSymbols } from "./market";
import { listMarketSources, marketSourceIds } from "./marketProvider";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  market: router({
    sources: publicProcedure.query(() => listMarketSources()),
    overview: publicProcedure.input(z.object({ source: z.enum(marketSourceIds).default("FINNHUB") }).default({ source: "FINNHUB" })).query(({ input }) => getMarketOverview(input.source)),
    search: publicProcedure.input(z.object({ query: z.string().min(1).max(80), source: z.enum(marketSourceIds).default("FINNHUB") })).query(({ input }) => searchSymbols(input.query, input.source)),
    quote: publicProcedure.input(z.object({ symbol: z.string().min(1).max(16), source: z.enum(marketSourceIds).default("FINNHUB") })).query(({ input }) => getQuote(input.symbol, input.source)),
    chart: publicProcedure.input(z.object({ symbol: z.string().min(1).max(16), range: z.enum(["1M", "3M", "1Y"]).default("1M"), source: z.enum(marketSourceIds).default("FINNHUB") })).query(({ input }) => getChart(input.symbol, input.range, input.source)),
    company: publicProcedure.input(z.object({ symbol: z.string().min(1).max(16), source: z.enum(marketSourceIds).default("FINNHUB") })).query(({ input }) => getCompanyResearch(input.symbol, input.source)),
    news: publicProcedure.input(z.object({ symbol: z.string().min(1).max(16), source: z.enum(marketSourceIds).default("FINNHUB") })).query(({ input }) => getCompanyNews(input.symbol, input.source)),
  }),
  watchlist: router({
    list: protectedProcedure.query(({ ctx }) => db.getWatchlist(ctx.user.id)),
    add: protectedProcedure.input(z.object({ symbol: z.string().min(1).max(16) })).mutation(async ({ ctx, input }) => {
      const symbol = normalizeSymbol(input.symbol);
      await db.addWatchlistItem(ctx.user.id, symbol);
      return { success: true, symbol };
    }),
    remove: protectedProcedure.input(z.object({ symbol: z.string().min(1).max(16) })).mutation(async ({ ctx, input }) => {
      const symbol = normalizeSymbol(input.symbol);
      await db.removeWatchlistItem(ctx.user.id, symbol);
      return { success: true, symbol };
    }),
  }),
  paper: router({
    reset: protectedProcedure.mutation(({ ctx }) => db.resetPaperAccount(ctx.user.id)),
    portfolio: protectedProcedure.query(async ({ ctx }) => {
      const [account, holdings, trades, snapshots] = await Promise.all([db.getOrCreatePaperAccount(ctx.user.id), db.getPaperHoldings(ctx.user.id), db.getPaperTrades(ctx.user.id), db.getPortfolioSnapshots(ctx.user.id)]);
      const enriched = await Promise.all(holdings.map(async (holding) => {
        const quote = await getQuote(holding.symbol).catch(() => null);
        const quantity = holding.quantity;
        const averageCost = Number(holding.averageCost);
        const marketValue = quote ? Number((quantity * quote.price).toFixed(2)) : null;
        return { ...holding, quote, averageCost, marketValue, unrealizedPnl: marketValue === null ? null : Number((marketValue - quantity * averageCost).toFixed(2)) };
      }));
      const cash = Number(account.cash);
      const positionValue = enriched.reduce((sum, holding) => sum + (holding.marketValue ?? 0), 0);
      const totalAssets = Number((cash + positionValue).toFixed(2));
      return { account: { ...account, initialCash: Number(account.initialCash), cash }, holdings: enriched, trades: trades.map((trade) => ({ ...trade, price: Number(trade.price), gross: Number(trade.gross), realizedPnl: Number(trade.realizedPnl) })), snapshots: snapshots.map((snapshot) => ({ ...snapshot, totalAssets: Number(snapshot.totalAssets), cash: Number(snapshot.cash) })), summary: { cash, positionValue: Number(positionValue.toFixed(2)), totalAssets, totalReturn: Number((totalAssets - Number(account.initialCash)).toFixed(2)), totalReturnPercent: Number((((totalAssets / Number(account.initialCash)) - 1) * 100).toFixed(2)) } };
    }),
    order: protectedProcedure.input(z.object({ symbol: z.string().min(1).max(16), side: z.enum(["BUY", "SELL"]), quantity: z.number().int().positive().max(1_000_000) })).mutation(async ({ ctx, input }) => {
      const symbol = normalizeSymbol(input.symbol);
      const quote = await getQuote(symbol);
      try {
        const result = await db.executePaperTrade({ userId: ctx.user.id, symbol, side: input.side, quantity: input.quantity, price: quote.price });
        return { success: true, symbol, side: input.side, marketPrice: quote.price, source: quote.source, executedAt: new Date(), ...result };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to execute paper order" });
      }
    }),
  }),
  research: router({
    ask: protectedProcedure.input(z.object({ symbol: z.string().min(1).max(16), question: z.string().min(2).max(800) })).mutation(async ({ input }) => {
      const research = await getCompanyResearch(input.symbol);
      const context = JSON.stringify({ quote: research.quote, profile: research.profile, metrics: research.metrics, news: research.news.slice(0, 6) });
      const response = await invokeLLM({ messages: [
        { role: "system", content: "你是金融学习助教。仅可根据提供的公开资料给出学习型要点归纳、术语解释、信息缺口和风险提示。不得给出买卖建议、价格预测或保证收益。回答使用简体中文，开头明确写‘信息仅供学习研究，不构成投资建议。’。" },
        { role: "user", content: `公司资料：${context}\n\n学习问题：${input.question}` },
      ] });
      return { answer: response.choices[0]?.message?.content ?? "暂未生成回答，请稍后重试。", source: "基于 Finnhub 返回的公司公开资料与资讯", refreshedAt: new Date() };
    }),
  }),
});

export type AppRouter = typeof appRouter;
