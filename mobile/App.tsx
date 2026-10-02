import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DOMESTIC_SYMBOLS, getDeviceMarketProvider, type CompanyResearchData, type DeviceMarketProvider, type MarketCandle as Candle, type MarketCurrency, type MarketIntradayPoint as IntradayPoint, type MarketQuote as Quote, type MarketScope, type MarketSourceId, type SymbolSearchResult } from "./src/services/marketProvider";
import { resolveSavedMarketSource } from "./src/services/marketSource";
import { applyLocalPaperOrder, calculateAccountMetrics, markedPrice, mergePositionMarks, preferredTradeSymbol } from "./src/services/paperAccount";
import { getPortfolioQuoteRefreshFeedback, resolvePortfolioQuoteRefreshStatus, shouldRefreshPortfolioQuotes, type PortfolioQuoteRefreshStatus } from "./src/services/marketQuoteRefresh";
import { ABOUT_DEVELOPER, ABOUT_ENTRY_LABEL, ABOUT_FEATURES, ABOUT_NOTICE, ABOUT_TERMS } from "./src/services/applicationContent";
import { createTradeModal, paperOrderPreflight, prepareStockDetailAction, resolveExecutableQuote } from "./src/services/stockInteraction";
import { paginateTradeHistory } from "./src/services/tradeHistoryPagination";
import { DEFAULT_MARKET_RULES_ENABLED, MARKET_TRADING_RULES_STORAGE_KEY, marketRuleSummary, marketSellRuleError, sellableQuantity } from "./src/services/marketTradingRules";
import { buildWidgetPortfolioSnapshot } from "./src/services/widgetPortfolioSnapshot";
import { QuoteDetailHeader } from "./src/components/QuoteDetailHeader";
import { domesticStyles } from "./src/styles/domesticMarket";
import { KlineChart } from "./src/components/KlineChart";
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Line, Path, Polyline } from "react-native-svg";

type Tab = "watchlist" | "market" | "news" | "research" | "trade" | "settings" | "about";
type Side = "BUY" | "SELL";

type PaperPosition = { symbol: string; quantity: number; averageCost: number; lastPrice?: number; lastPriceTimestamp?: number; displayName?: string; currency?: MarketCurrency; market?: MarketScope; sourceId?: MarketSourceId; buyLocks?: { quantity: number; unlockAt: number }[] };
type PaperTrade = { id: string; side: Side; symbol: string; quantity: number; price: number; realizedPnl: number; executedAt: number; displayName?: string; currency?: MarketCurrency; market?: MarketScope; sourceId?: MarketSourceId };
type AccountSnapshot = { totalAssets: number; capturedAt: number };
type PaperAccount = { initialCash: number; cash: number; positions: PaperPosition[]; trades: PaperTrade[]; snapshots: AccountSnapshot[] };

const VAULT_KEY = "finscope-paper-account-v1";
const WATCHLIST_KEY_PREFIX = "finscope-watchlist-v2";
const MARKET_SOURCE_KEY = "finscope-market-source-v1";
const FINNHUB_KEY = "finscope-finnhub-api-key";
const TUSHARE_KEY = "finscope-tushare-token";
const FIRST_LAUNCH_RISK_KEY = "finscope-first-launch-risk-confirmed-v1";
const WIDGET_DEFAULT_QUANTITY_KEY = "finscope-widget-default-quantity-v1";
const STARTING_CASH = 100000;
const DEFAULT_SYMBOLS = ["000001.SH", "399001.SZ", "399006.SZ", "600519.SH", "00700.HK", "09988.HK"];

function persistedInstrument(item: { symbol: string; displayName?: string; currency?: MarketCurrency }) {
  const domestic = DOMESTIC_SYMBOLS.find((known) => known.symbol === item.symbol);
  return { displayName: item.displayName ?? domestic?.name ?? item.symbol, currency: item.currency ?? domestic?.currency ?? "CNY" as MarketCurrency };
}

function inferredPositionSource(position: Pick<PaperPosition, "market" | "sourceId">): MarketSourceId {
  if (position.sourceId) return position.sourceId;
  return position.market === "US" ? "FINNHUB" : "TENCENT";
}

const C = {
  ink: "#060609",
  panel: "#0D0E13",
  panel2: "#14151D",
  white: "#F5F7FB",
  muted: "#8B91A2",
  cyan: "#00F0FF",
  magenta: "#FF2EA6",
  lime: "#80FF70",
  red: "#FF4E71",
  yellow: "#F6B93B",
  line: "#292B36",
  grid: "#1A1B24",
};

const money = (value: number | null | undefined, currency: MarketCurrency = "CNY") =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(currency === "USD" ? "en-US" : "zh-CN", { style: "currency", currency }).format(value);
const quoteMoney = (quote: Quote | undefined) => money(quote?.price, quote?.currency ?? "CNY");
const numeric = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

function changeColor(value: number) {
  return value >= 0 ? C.red : C.lime;
}

function credentialStorageKey(source: MarketSourceId) {
  return source === "TUSHARE" ? TUSHARE_KEY : FINNHUB_KEY;
}

async function loadMarketCredential(source: MarketSourceId) {
  if (source === "TENCENT") return null;
  const key = credentialStorageKey(source);
  return Platform.OS === "web" ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

async function saveMarketCredential(source: MarketSourceId, value: string) {
  if (source === "TENCENT") return;
  const key = credentialStorageKey(source);
  if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function removeMarketCredential(source: MarketSourceId) {
  if (source === "TENCENT") return;
  const key = credentialStorageKey(source);
  if (Platform.OS === "web") return AsyncStorage.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

function watchlistStorageKey(source: MarketSourceId) {
  return `${WATCHLIST_KEY_PREFIX}-${source.toLowerCase()}`;
}

function GlitchMark() {
  return (
    <View style={styles.brandMark}>
      <View style={[styles.markSlash, { backgroundColor: C.cyan, transform: [{ rotate: "-24deg" }, { translateX: -2 }] }]} />
      <View style={[styles.markSlash, { backgroundColor: C.magenta, transform: [{ rotate: "-24deg" }, { translateX: 3 }] }]} />
      <Svg width={22} height={28} viewBox="0 0 22 28" style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none"><Path d="M4 20 L8 15 L10.5 17 L14 9 L18 11" fill="none" stroke={C.lime} strokeWidth={2.2} strokeLinecap="square" strokeLinejoin="miter" /></Svg>
    </View>
  );
}

function ScanBackground() {
  return <View pointerEvents="none" style={styles.scanLayer} />;
}

function Tag({ children, tone = "cyan" }: { children: string; tone?: "cyan" | "magenta" | "muted" }) {
  const color = tone === "cyan" ? C.cyan : tone === "magenta" ? C.magenta : C.muted;
  return <Text style={[styles.tag, { color, borderColor: color + "66" }]}>{children}</Text>;
}

function Header({ activeTab, onPressAbout }: { activeTab: Tab; onPressAbout: () => void }) {
  const label = { watchlist: "自选观察", market: "市场脉冲", news: "资讯脉冲", research: "企业研究", trade: "交易", settings: "终端设置", about: "关于应用" }[activeTab];
  return (
    <View style={styles.header}>
      <View style={styles.headerBrand}>
        <GlitchMark />
        <View>
          <Text style={styles.brandName}>FIN<SupText>•</SupText>SCOPE</Text>
          <Text style={styles.brandSub}>MARKET / ANALYZE / REVIEW</Text>
        </View>
      </View>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{label}</Text>
        <Text style={styles.headerCode}>SYS::MARKET_01</Text>
      </View>
      <Pressable onPress={onPressAbout} accessibilityLabel={ABOUT_ENTRY_LABEL} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="information-outline" color={C.white} size={22} />
      </Pressable>
    </View>
  );
}

function SupText({ children }: { children: string }) {
  return <Text style={{ color: C.magenta }}>{children}</Text>;
}

function MiniSpark({ positive }: { positive: boolean }) {
  const color = positive ? C.red : C.lime;
  const points = positive ? "0,32 14,26 27,30 42,18 56,24 70,6 84,14 100,1" : "0,5 14,12 28,9 42,24 56,18 70,34 84,28 100,39";
  return <Svg width={100} height={42} viewBox="0 0 100 42"><Polyline points={points} fill="none" stroke={color} strokeWidth={1.7} /></Svg>;
}

function QuoteRow({ quote, onSelect, selected, testID }: { quote: Quote; onSelect: () => void; selected?: boolean; testID?: string }) {
  const up = quote.changePercent >= 0;
  return (
    <Pressable testID={testID} onPress={onSelect} style={({ pressed }) => [styles.quoteRow, selected && styles.quoteSelected, pressed && styles.pressed]}>
      <View style={styles.quoteSymbol}><Text style={styles.rowSymbol}>{quote.displayName || quote.symbol}</Text><Text style={styles.rowMeta}>{quote.symbol} · {quote.market === "INDEX" ? "国内指数" : quote.market === "A_SHARE" ? "沪深京" : quote.market === "HK" ? "港股" : "美股"} · {quote.source}</Text></View>
      <MiniSpark positive={up} />
      <View style={styles.quotePrice}><Text style={styles.rowPrice}>{money(quote.price, quote.currency)}</Text><Text style={[styles.rowChange, { color: changeColor(quote.changePercent) }]}>{signed(quote.change)} · {signed(quote.changePercent)}%</Text></View>
    </Pressable>
  );
}

function compactVolume(value: number | undefined) {
  if (!Number.isFinite(value)) return "—";
  if ((value ?? 0) >= 100000000) return `${((value ?? 0) / 100000000).toFixed(2)}亿`;
  if ((value ?? 0) >= 10000) return `${((value ?? 0) / 10000).toFixed(2)}万`;
  return numeric(value ?? 0);
}

function MarketFacts({ quote }: { quote?: Quote }) {
  const rows = [
    ["现价", quote ? money(quote.price, quote.currency) : "—", quote?.changePercent ?? 0],
    ["涨跌额", quote ? signed(quote.change) : "—", quote?.change ?? 0],
    ["涨跌幅", quote ? `${signed(quote.changePercent)}%` : "—", quote?.changePercent ?? 0],
    ["今开", quote?.open ? money(quote.open, quote.currency) : "—", 0],
    ["最高", quote?.high ? money(quote.high, quote.currency) : "—", 0],
    ["最低", quote?.low ? money(quote.low, quote.currency) : "—", 0],
    ["昨收", quote?.previousClose ? money(quote.previousClose, quote.currency) : "—", 0],
    ["成交量", compactVolume(quote?.volume), 0],
  ] as const;
  return <View style={domesticStyles.marketFacts}>{rows.map(([label, value, change]) => <View key={label} style={domesticStyles.marketFact}><Text style={domesticStyles.marketFactLabel}>{label}</Text><Text style={[domesticStyles.marketFactValue, label.includes("涨跌") && { color: changeColor(change) }]}>{value}</Text></View>)}</View>;
}

function AssetCurve({ snapshots, currentTotal }: { snapshots: AccountSnapshot[]; currentTotal: number }) {
  const points = [...snapshots, { totalAssets: currentTotal, capturedAt: Date.now() }].slice(-24);
  const values = points.map((item) => item.totalAssets);
  const min = Math.min(...values, currentTotal);
  const max = Math.max(...values, currentTotal);
  const span = Math.max(max - min, Math.max(max, 1) * 0.01);
  const coordinates = points.length > 1 ? points.map((item, index) => `${index * (320 / Math.max(points.length - 1, 1))},${Math.max(10, Math.min(106, 106 - ((item.totalAssets - min) / span) * 92))}`).join(" ") : "";
  return <View style={{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 14, gap: 5 }}><Text style={styles.assetsLabel}>ASSET CURVE / LOCAL ACCOUNT</Text><Svg width="100%" height={124} viewBox="0 0 320 118" preserveAspectRatio="none">{[18, 44, 70, 96].map((y) => <Line key={y} x1="0" x2="320" y1={y} y2={y} stroke={C.grid} strokeWidth="1" />)}{coordinates ? <Polyline points={coordinates} fill="none" stroke={C.cyan} strokeWidth="2.2" /> : null}</Svg><Text style={styles.chartAxisText}>{points.length} 个账户快照 · 仅反映当前账户与可用行情标记</Text></View>;
}

function SectionTitle({ code, title, action }: { code: string; title: string; action?: string }) {
  return <View style={styles.sectionTitle}><View><Text style={styles.sectionCode}>{code}</Text><Text style={styles.sectionName}>{title}</Text></View>{action ? <Text style={styles.sectionAction}>{action}</Text> : null}</View>;
}

function WatchlistScreen({ quotes, candles, intraday, chartError, selected, onSelect, onOpenResearch, onRefresh, onRemoveSelected, refreshing, detailsLoading, hasKey, provider }: { quotes: Quote[]; candles: Candle[]; intraday: IntradayPoint[]; chartError: string | null; selected?: Quote; onSelect: (quote: Quote) => void; onOpenResearch: () => void; onRefresh: () => void; onRemoveSelected: () => void; refreshing: boolean; detailsLoading: boolean; hasKey: boolean; provider: DeviceMarketProvider }) {
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ ROOT / WATCHLIST ]</Text><Tag tone={hasKey ? "cyan" : "magenta"}>{hasKey ? (provider.requiresCredential ? "TOKEN CONNECTED" : "PUBLIC DELAYED") : "TOKEN REQUIRED"}</Tag></View>
    <View style={domesticStyles.marketScopeRow}><Tag>沪深京</Tag><Tag>港股</Tag><Tag tone="muted">美股可选</Tag></View>
    {!hasKey ? <EmptyConnection provider={provider} /> : null}
    {hasKey && quotes.length === 0 ? <Pressable onPress={onRefresh} style={({ pressed }) => [styles.connectCard, pressed && styles.pressed]}><MaterialCommunityIcons name="radar" size={28} color={C.cyan} /><Text style={styles.connectTitle}>载入国内观察列表</Text><Text style={styles.connectCopy}>{provider.requiresCredential ? `将请求上证指数、深证成指、创业板指和沪深常用标的；数据能力以你的 ${provider.label} 权限为准。` : "无需注册，载入基于实测公开响应的国内延时行情；该内测源没有面向第三方的公开字段契约或 SLA。"}</Text></Pressable> : null}
    {quotes.length > 0 ? <>
      <QuoteDetailHeader title={selected?.displayName || selected?.symbol || "未选择"} meta={`${selected?.symbol ?? "—"} · ${selected?.source ?? "—"} · 刷新 ${selected ? new Date(selected.timestamp * 1000).toLocaleTimeString() : "—"}`} price={quoteMoney(selected)} change={`${signed(selected?.change ?? 0)} · ${signed(selected?.changePercent ?? 0)}%`} positiveColor={changeColor(selected?.changePercent ?? 0)} titleColor={C.white} mutedColor={C.muted} />
      <MarketFacts quote={selected} />
      {detailsLoading ? <View style={{ minHeight: 230, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, justifyContent: "center", alignItems: "center", gap: 9, padding: 20 }}><ActivityIndicator color={C.cyan} size="small" /><Text style={{ color: C.white, fontSize: 13, fontWeight: "800" }}>正在加载当前数据源的分时与日线</Text><Text style={{ color: C.muted, fontSize: 10, lineHeight: 16, textAlign: "center" }}>旧数据不会在切换后继续绘制；完成后将自动渲染当前标的。</Text></View> : <KlineChart candles={candles} intraday={intraday} currency={selected?.currency ?? "CNY"} quoteTimestamp={selected?.timestamp} errorMessage={chartError} adjustmentLabel={provider.id === "TENCENT" && selected?.assetType === "EQUITY" ? "前复权" : provider.id === "TUSHARE" ? "未复权" : "供应商口径"} />}
      <View style={styles.rowBetween}><Text style={styles.caption}>{detailsLoading ? "当前数据源正在返回分时与日线，请稍候。" : candles.length ? `行情与日线由 ${selected?.source} 提供，价格可能实时或延时，请以供应商时间戳为准。` : provider.requiresCredential ? `当前标的已有报价但未取得日线；请刷新，或检查 ${provider.keyLabel} 的日线权限。` : "当前公开延时行情未返回日线；请刷新后重试，数据失败不会以空白图表伪装。"}</Text><Pressable onPress={onRefresh} style={({ pressed }) => [styles.microAction, pressed && styles.pressed]}><MaterialCommunityIcons name="refresh" size={15} color={C.cyan} /><Text style={styles.microActionText}>{refreshing ? "SYNC" : "刷新"}</Text></Pressable></View>
      {selected ? <Pressable onPress={onOpenResearch} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><MaterialCommunityIcons name="file-search-outline" size={18} color={C.ink} /><Text style={styles.primaryButtonText}>查看 {selected.displayName || selected.symbol} 详情与研究</Text></Pressable> : null}
      <SectionTitle code="01 / WATCH" title="自选标的" action={`${quotes.length} 个标的`} />
      {selected ? <Pressable onPress={onRemoveSelected} style={({ pressed }) => [watchlistStyles.removeButton, pressed && styles.pressed]}><MaterialCommunityIcons name="star-remove-outline" size={15} color={C.red} /><Text style={watchlistStyles.removeText}>移除 {selected.symbol}</Text></Pressable> : null}
      <View style={styles.listPanel}>{quotes.map((quote) => <QuoteRow key={quote.symbol} testID={`watchlist-quote-${quote.symbol}`} quote={quote} selected={quote.symbol === selected?.symbol} onSelect={() => onSelect(quote)} />)}</View>
    </> : null}
  </ScrollView>;
}

function EmptyConnection({ provider }: { provider: DeviceMarketProvider }) {
  return <View style={styles.connectCard}><MaterialCommunityIcons name="key-chain-variant" size={28} color={C.magenta} /><Text style={styles.connectTitle}>未连接国内数据 Token</Text><Text style={styles.connectCopy}>前往「设置」导入个人 {provider.keyLabel} 后，终端才会请求 A 股、港股、指数和企业公开资料。</Text><Text style={styles.warningInline}>不会抓取、逆向或复用参考小程序的内部接口。</Text></View>;
}

function MarketScreen({ quotes, results, onSelect, onOpenDetails, onAddToWatchlist, hasKey, onSearch, provider, searching, searchError }: { quotes: Quote[]; results: SymbolSearchResult[]; onSelect: (quote: Quote) => void; onOpenDetails: (symbol: string) => void; onAddToWatchlist: (symbol: string) => void; hasKey: boolean; onSearch: (query: string) => void; provider: DeviceMarketProvider; searching: boolean; searchError: string | null }) {
  const [symbol, setSymbol] = useState("");
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ MARKET / CN SIGNALS ]</Text><Tag>{hasKey ? "A / HK DATA" : "OFFLINE"}</Tag></View>
    <View style={domesticStyles.marketScopeRow}><Tag>上证 · 深证 · 创业板</Tag><Tag>港股</Tag></View>
    <TextInput value={symbol} onChangeText={setSymbol} placeholder="代码或名称，例如 600519.SH、00700.HK、贵州茅台" placeholderTextColor={C.muted} autoCapitalize="characters" style={styles.searchInput} onSubmitEditing={() => onSearch(symbol)} returnKeyType="search" />
    <Pressable disabled={searching} onPress={() => onSearch(symbol)} style={({ pressed }) => [styles.primaryButton, searching && styles.disabledButton, pressed && styles.pressed]}><MaterialCommunityIcons name={searching ? "progress-clock" : "radar"} size={18} color={C.ink} /><Text style={styles.primaryButtonText}>{searching ? "检索中…" : "查询真实行情"}</Text></Pressable>
    {searchError ? <View style={styles.disabledProvider}><MaterialCommunityIcons name="information-outline" size={18} color={C.magenta} /><Text style={[styles.disabledProviderText, { color: C.magenta }]}>{searchError}</Text></View> : null}
    {results.length ? <><SectionTitle code="02 / FIND" title="股票与企业检索" action={`${results.length} 项结果`} /><View style={styles.listPanel}>{results.map((item) => <View key={`${item.symbol}-${item.description}`} style={styles.quoteRow}><Pressable onPress={() => onOpenDetails(item.symbol)} style={({ pressed }) => [styles.quoteSymbol, pressed && styles.pressed]}><Text style={styles.rowSymbol}>{item.description || item.displaySymbol}</Text><Text style={styles.rowMeta}>{item.displaySymbol} · {item.type} · 点击查看详情</Text></Pressable><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable onPress={() => onAddToWatchlist(item.symbol)} accessibilityLabel={`添加 ${item.symbol} 到自选`} style={({ pressed }) => [{ borderWidth: 1, borderColor: C.cyan + "88", paddingHorizontal: 9, paddingVertical: 7 }, pressed && styles.pressed]}><Text style={{ color: C.cyan, fontSize: 10, fontWeight: "800" }}>加自选</Text></Pressable><Pressable onPress={() => onOpenDetails(item.symbol)} accessibilityLabel={`查看 ${item.symbol} 详情`} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons name="arrow-top-right" size={18} color={C.cyan} /></Pressable></View></View>)}</View></> : null}
    <SectionTitle code="02A / PULSE" title="市场关注榜" action="按涨跌幅排序" />
    {quotes.length ? <View style={styles.marketGrid}>{[...quotes].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).map((quote) => <Pressable key={quote.symbol} onPress={() => onSelect(quote)} style={({ pressed }) => [styles.marketTile, pressed && styles.pressed]}><Text style={styles.tileSymbol}>{quote.displayName || quote.symbol}</Text><Text style={styles.rowMeta}>{quote.symbol} · {quote.market === "INDEX" ? "指数" : quote.market === "HK" ? "港股" : quote.market === "A_SHARE" ? "A股" : "美股"}</Text><Text style={styles.tilePrice}>{money(quote.price, quote.currency)}</Text><Text style={[styles.tileChange, { color: changeColor(quote.changePercent) }]}>{signed(quote.change)} · {signed(quote.changePercent)}%</Text><MiniSpark positive={quote.changePercent >= 0} /></Pressable>)}</View> : <View style={styles.emptyPanel}><MaterialCommunityIcons name="chart-line-variant" size={28} color={C.muted} /><Text style={styles.emptyTitle}>{hasKey ? "搜索一个国内标的开始" : `请先导入 ${provider.keyLabel}`}</Text><Text style={styles.emptyCopy}>这里不会预置或伪造价格数据。</Text></View>}
  </ScrollView>;
}

function NewsScreen({ selected, research, onOpenResearch }: { selected?: Quote; research: CompanyResearchData | null; onOpenResearch: (headline: string) => void }) {
  const isDomestic = selected?.market === "A_SHARE" || selected?.market === "HK" || selected?.market === "INDEX";
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ NEWS / PUBLIC CONTEXT ]</Text><Tag>{research ? `${research.news.length} ITEMS` : "WAITING"}</Tag></View>
    <View style={styles.riskBanner}><MaterialCommunityIcons name="newspaper-variant-outline" size={21} color={C.magenta} /><Text style={styles.riskText}>新闻仅作为公开信息研究线索，不构成投资建议。点按标题会将该新闻带入对应企业的学习问题。</Text></View>
    {research && selected ? <><View style={styles.researchTarget}><Text style={styles.sectionCode}>当前资讯对象</Text><Text style={styles.researchSymbol}>{research.profile.name}</Text><Text style={styles.researchPrice}>{selected.symbol} · {research.source} · 刷新 {new Date(research.refreshedAt).toLocaleTimeString()}</Text></View><SectionTitle code="03N / FEED" title="公司新闻" action="OPEN RESEARCH" /><View style={styles.listPanel}>{research.news.length ? research.news.map((item) => <Pressable key={`${item.id}-${item.headline}`} onPress={() => onOpenResearch(item.headline)} style={({ pressed }) => [{ padding: 15, borderBottomWidth: 1, borderBottomColor: C.line }, pressed && styles.pressed]}><Text style={{ color: C.white, fontSize: 14, fontWeight: "700", lineHeight: 20 }}>{item.headline}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 7 }}>{item.source} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "日期未标注"}</Text>{item.summary ? <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }} numberOfLines={3}>{item.summary}</Text> : null}</Pressable>) : <View style={styles.emptyPanel}><Text style={styles.emptyTitle}>{isDomestic ? "当前未接入授权的个股资讯服务" : "当前没有可用公司新闻"}</Text><Text style={styles.emptyCopy}>{isDomestic ? "默认公开行情测试源仅用于已实测的报价、日线与部分分钟数据。未发现腾讯面向第三方且具有明确授权边界的个股资讯 API，因此不会抓取、逆向或复用腾讯财经网页内容；请以交易所公告、公司官网或后续授权的资讯服务为准。" : "供应商没有返回近期项目；你仍可返回行情或研究页继续查阅公开资料。"}</Text></View>}</View></> : <View style={styles.emptyPanel}><MaterialCommunityIcons name="newspaper-variant-outline" size={28} color={C.muted} /><Text style={styles.emptyTitle}>请先选择企业</Text><Text style={styles.emptyCopy}>从“行情”搜索或从“自选”选择一个已加载真实行情的标的，终端会请求该企业的近期公开新闻。</Text></View>}
  </ScrollView>;
}

function ResearchScreen({ selected, research, loading, error, seedQuestion, hasKey }: { selected?: Quote; research: CompanyResearchData | null; loading: boolean; error: string | null; seedQuestion: string; hasKey: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  useEffect(() => { if (seedQuestion) { setQuestion(seedQuestion); setAnswer(null); } }, [seedQuestion]);
  const generate = () => {
    if (!selected) { Alert.alert("未选择企业", "请先在行情或自选页选择一个已加载真实行情的股票。 "); return; }
    const direction = selected.changePercent >= 0 ? "上涨" : "下跌";
    const profileLine = research ? `${research.profile.name} 的公开资料显示其所属行业为 ${research.profile.industry ?? "供应商未标注"}，交易所为 ${research.profile.exchange ?? "供应商未标注"}。` : "企业公开资料尚未加载完成。";
    const metricLine = research?.metrics.peTtm !== null && research?.metrics.peTtm !== undefined ? `基础术语提示：市盈率（TTM）字段当前为 ${numeric(research.metrics.peTtm)}，应结合盈利质量、行业差异和报告期阅读，不能孤立解读。` : "基础术语提示：涨跌幅 =（最新价－前收盘价）÷前收盘价；单日波动不代表预期收益。";
    const newsLine = research?.news[0]?.headline ? `最近一条已加载的公司新闻标题为“${research.news[0].headline}”，阅读时应回到原始公告或新闻链接核验日期和上下文。` : "尚未获得可用于研究的公司新闻，建议核对原始公告与公开披露。";
    const normalizedQuestion = question.trim().toLowerCase();
    const focus = /市盈率|估值|pe|pb|倍数/.test(normalizedQuestion)
      ? `估值学习：${metricLine} 还应横向比较可比公司的口径，并确认该字段对应的报告期、币种与是否存在一次性项目。`
      : /新闻|公告|事件|headline/.test(normalizedQuestion)
        ? `新闻学习：${newsLine} 需要区分事实披露、媒体解读和市场价格反应，并核对事件发生时间与行情时间戳。`
        : /营收|收入|利润|财务|负债|现金流/.test(normalizedQuestion)
          ? `财务学习：已加载的净利率（TTM）为 ${research?.metrics.netProfitMarginTtm === null || research?.metrics.netProfitMarginTtm === undefined ? "供应商未标注" : `${numeric(research.metrics.netProfitMarginTtm)}%`}。该指标应与收入增长、现金流和资本结构一起解读。`
          : /风险|波动|跌|涨|回撤/.test(normalizedQuestion)
            ? `风险学习：涨跌幅只描述相对前收盘价的变化；还应关注流动性、市场时段、公司披露、集中持仓和数据延迟等不确定性。`
            : `行情学习：${selected.symbol} 的最新可用报价为 ${quoteMoney(selected)}，相对上一交易日${direction} ${Math.abs(selected.changePercent).toFixed(2)}%。这只描述当前可用价格与前收盘价的变化，不等同于趋势判断。`;
    setAnswer(`信息仅供学习研究，不构成投资建议。\n\n针对“${question.trim() || "当前行情如何理解"}”：${focus}\n\n${profileLine}\n\n${metricLine}\n\n${newsLine}\n\n继续研究时，请核对公司业务、财务披露、公告日期、新闻原文、数据时点、汇率、市场开闭市与流动性风险。`);
  };
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ RESEARCH / LEARNING MODE ]</Text><Tag tone="magenta">NOT ADVICE</Tag></View>
    <View style={styles.riskBanner}><MaterialCommunityIcons name="shield-alert-outline" size={21} color={C.magenta} /><Text style={styles.riskText}>信息仅供学习研究，不构成投资建议。研究结论不可替代真实行情核验、公开披露阅读或专业意见。</Text></View>
    <View style={styles.researchTarget}><Text style={styles.sectionCode}>当前研究对象</Text><Text style={styles.researchSymbol}>{selected?.displayName || selected?.symbol || "未选择"}</Text><Text style={styles.researchPrice}>{selected ? `${selected.symbol} · ${quoteMoney(selected)} · ${signed(selected.changePercent)}%` : "请从行情页选择一个标的"}</Text>{research ? <Text style={{ color: C.muted, fontSize: 10, marginTop: 8, lineHeight: 15 }}>{research.profile.name} · {research.profile.industry ?? "行业未标注"} · {research.source} · 刷新 {new Date(research.refreshedAt).toLocaleTimeString()}</Text> : loading ? <Text style={{ color: C.muted, fontSize: 10, marginTop: 8 }}>正在加载企业公开资料…</Text> : null}</View>
    {research ? <><SectionTitle code="03 / FACTS" title="企业公开资料" action="PUBLIC CONTEXT" />{research.profile.description ? <View style={styles.answerPanel}><Text style={styles.answerLabel}>COMPANY DESCRIPTION // {research.profile.descriptionSource ?? "PUBLIC SOURCE"}</Text><Text style={styles.answerText}>{research.profile.description}</Text></View> : <View style={styles.disabledProvider}><MaterialCommunityIcons name="information-outline" size={18} color={C.muted} /><Text style={styles.disabledProviderText}>{selected?.market === "A_SHARE" || selected?.market === "HK" || selected?.market === "INDEX" ? "当前国内公开行情适配器仅返回行情、日线、标的名称和交易所；公司简介、财务指标与新闻需要另行取得具备明确授权的国内研究数据源。" : "当前供应商未返回可展示的公司业务摘要；请结合行业、交易所和公司原始披露继续研究。"}</Text></View>}<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}><View style={[styles.metric, { minWidth: "44%", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 12 }]}><Metric label="行业" value={research.profile.industry ?? "—"} /></View><View style={[styles.metric, { minWidth: "44%", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 12 }]}><Metric label="交易所" value={research.profile.exchange ?? "—"} /></View><View style={[styles.metric, { minWidth: "44%", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 12 }]}><Metric label="PE (TTM)" value={research.metrics.peTtm === null ? "—" : numeric(research.metrics.peTtm)} /></View><View style={[styles.metric, { minWidth: "44%", backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 12 }]}><Metric label="净利率 (TTM)" value={research.metrics.netProfitMarginTtm === null ? "—" : `${numeric(research.metrics.netProfitMarginTtm)}%`} /></View></View><SectionTitle code="03A / NEWS" title="公司新闻" action={`${research.news.length} ITEMS`} /><View style={styles.listPanel}>{research.news.length ? research.news.slice(0, 3).map((item) => <Pressable onPress={() => setQuestion(`请结合这条新闻解释 ${research.symbol} 的学习研究要点：${item.headline}`)} style={({ pressed }) => [{ padding: 13, borderBottomWidth: 1, borderBottomColor: C.line }, pressed && styles.pressed]} key={`${item.id}-${item.headline}`}><Text style={{ color: C.white, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>{item.headline}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>{item.source} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "日期未标注"} · 点按带入学习问题</Text></Pressable>) : <Text style={[styles.emptyCopy, { padding: 14 }]}>{selected?.market === "A_SHARE" || selected?.market === "HK" || selected?.market === "INDEX" ? "当前公开国内行情源不包含新闻数据；请核对交易所公告、公司官网或后续授权的新闻数据源。" : "供应商在当前查询中未返回公司新闻。"}</Text>}</View></> : error ? <View style={styles.riskBanner}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={C.magenta} /><Text style={styles.riskText}>企业资料加载失败：{error}。行情仍可单独查看；请稍后刷新或检查密钥与供应商配额。</Text></View> : null}
    <SectionTitle code="03 / ASK" title="学习型提问" />
    <TextInput value={question} onChangeText={setQuestion} placeholder="例如：如何理解该标的今日的涨跌幅？" placeholderTextColor={C.muted} multiline style={[styles.searchInput, styles.questionInput]} />
    <Pressable onPress={generate} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><MaterialCommunityIcons name="school-outline" size={18} color={C.ink} /><Text style={styles.primaryButtonText}>生成学习提示</Text></Pressable>
    {answer ? <View style={styles.answerPanel}><Text style={styles.answerLabel}>LOCAL LEARNING OUTPUT // PUBLIC CONTEXT</Text><Text style={styles.answerText}>{answer}</Text><Text style={styles.answerSource}>数据基础：{hasKey ? `${research?.source ?? selected?.source ?? "当前数据源"} 返回的当前报价及已覆盖公开字段；本地规则根据问题生成学习提示。` : "未连接数据源"}</Text></View> : <View style={styles.emptyPanel}><MaterialCommunityIcons name="book-open-variant" size={28} color={C.muted} /><Text style={styles.emptyTitle}>从真实资料开始提问</Text><Text style={styles.emptyCopy}>先从行情页选择一个标的；国内行情适配器会载入已覆盖的报价和日线，企业资料与新闻覆盖范围将按数据源明确显示。</Text></View>}
  </ScrollView>;
}

export function TradeScreen({ account, quotes, selected, onOrder, onReset, refreshing, onRefresh, refreshStatus, lastSuccessfulRefreshAt, onOpenPositionDetails, onResolvePositionQuote, marketRulesEnabled = DEFAULT_MARKET_RULES_ENABLED, currentMarketSource }: { account: PaperAccount; quotes: Quote[]; selected?: Quote; onOrder: (side: Side, quantity: number, symbol: string, executionQuote?: Quote, executionSourceId?: MarketSourceId) => boolean; onReset: () => void; refreshing: boolean; onRefresh: () => void; refreshStatus: PortfolioQuoteRefreshStatus; lastSuccessfulRefreshAt: number | null; onOpenPositionDetails: (symbol: string) => void; onResolvePositionQuote?: (position: PaperPosition) => Promise<{ quote: Quote; sourceId: MarketSourceId } | null>; marketRulesEnabled?: boolean; currentMarketSource?: MarketSourceId }) {
  const [modal, setModal] = useState<{ side: Side; symbol: string; quote?: Quote; sourceId?: MarketSourceId } | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [orderFeedback, setOrderFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [tradeHistoryPage, setTradeHistoryPage] = useState(1);
  const orderSubmittingRef = useRef(false);
  const orderQuote = modal?.quote ?? (modal ? resolveExecutableQuote(quotes, selected, modal.symbol) : undefined);
  const openOrderModal = (side: Side, quote = selected, sourceId?: MarketSourceId) => {
    const nextModal = createTradeModal(side, quote, quotes);
    if (!nextModal) { Alert.alert("报价未加载", "请先在自选页刷新该标的的最新可用报价。 "); return; }
    orderSubmittingRef.current = false;
    setOrderFeedback(null);
    setModal({ ...nextModal, sourceId });
  };
  const openPositionOrder = async (side: Side, position: PaperPosition) => {
    const sourceId = inferredPositionSource(position);
    const present = !currentMarketSource || sourceId === currentMarketSource ? quotes.find((quote) => quote.symbol === position.symbol) ?? (selected?.symbol === position.symbol ? selected : undefined) : undefined;
    if (present) { openOrderModal(side, present, sourceId); return; }
    if (!onResolvePositionQuote) { Alert.alert("报价未加载", "当前持仓没有可用报价；请先刷新后再操作。"); return; }
    setOrderFeedback({ tone: "error", message: `正在从持仓原始数据源加载 ${persistedInstrument(position).displayName} 的可用报价…` });
    const resolved = await onResolvePositionQuote(position);
    if (resolved) openOrderModal(side, resolved.quote, resolved.sourceId);
  };
  const displayCurrency = selected?.currency ?? quotes[0]?.currency ?? "CNY";
  const accountCurrency = account.positions.length ? persistedInstrument(account.positions[0]).currency : displayCurrency;
  const pagedTrades = paginateTradeHistory(account.trades, tradeHistoryPage);
  useEffect(() => { setTradeHistoryPage((page) => Math.min(page, pagedTrades.totalPages)); }, [account.trades.length, pagedTrades.totalPages]);
  const metrics = calculateAccountMetrics(account.initialCash, account.cash, account.positions, quotes);
  const { marketValue, totalAssets, returnAmount, returnPercent, dayPnl } = metrics;
  const refreshFeedback = getPortfolioQuoteRefreshFeedback(refreshStatus, lastSuccessfulRefreshAt, (value) => new Date(value).toLocaleTimeString());
  const refreshStatusColor = refreshFeedback.tone === "error" ? C.magenta : refreshFeedback.tone === "warning" ? C.yellow : C.muted;
  const submit = () => {
    if (orderSubmittingRef.current) return;
    const parsed = Number(quantity);
    if (!modal || !orderQuote || !Number.isInteger(parsed) || parsed <= 0) {
      const message = "数量无效：请输入正整数股数，并确认当前标的已载入最新可用行情。";
      setOrderFeedback({ tone: "error", message });
      Alert.alert("数量无效", message);
      return;
    }
    orderSubmittingRef.current = true;
    if (onOrder(modal.side, parsed, orderQuote.symbol, orderQuote, modal.sourceId)) {
      setOrderFeedback({ tone: "success", message: `${modal.side === "BUY" ? "买入" : "卖出"}已成交：${orderQuote.displayName || orderQuote.symbol} ${parsed} 股。持仓与 BUY/SELL 流水已写入本机。` });
      setModal(null);
      setQuantity("100");
    } else {
      orderSubmittingRef.current = false;
      setOrderFeedback({ tone: "error", message: "委托未成交：请检查可用报价、现金或持仓数量。" });
    }
  };
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ ORDER / EXECUTION ]</Text><Tag>LOCAL ACCOUNT</Tag></View>
    <View style={styles.assetsCard}><View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}><View><Text style={styles.assetsLabel}>TOTAL ASSETS / ACCOUNT</Text><Text style={styles.assetsValue}>{money(totalAssets, accountCurrency)}</Text></View><Pressable onPress={onRefresh} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: C.cyan + "66", paddingHorizontal: 9, paddingVertical: 7 }, pressed && styles.pressed]}><MaterialCommunityIcons name="refresh" size={14} color={C.cyan} /><Text style={{ color: C.cyan, fontSize: 10, fontWeight: "800" }}>{refreshing ? "更新中" : "更新估值"}</Text></Pressable></View><Text style={{ color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 10 }}>应用在前台停留时每 30 秒刷新；进入持仓页、恢复前台或手动点击也会刷新。</Text><Text style={{ color: refreshStatusColor, fontSize: 10, lineHeight: 15, marginTop: 4 }}>{refreshFeedback.copy}</Text><View style={[styles.assetStats, { flexWrap: "wrap", rowGap: 14 }]}><View style={{ width: "30%" }}><Metric label="可用现金" value={money(account.cash, accountCurrency)} /></View><View style={{ width: "30%" }}><Metric label="持仓市值" value={money(marketValue, accountCurrency)} /></View><View style={{ width: "30%" }}><Metric label="累计收益率" value={`${signed(returnPercent)}%`} color={changeColor(returnPercent)} /></View><View style={{ width: "30%" }}><Metric label="累计盈亏" value={`${returnAmount >= 0 ? "+" : ""}${money(returnAmount, accountCurrency)}`} color={changeColor(returnAmount)} /></View><View style={{ width: "30%" }}><Metric label="当日盈亏" value={dayPnl === null ? "—" : `${dayPnl >= 0 ? "+" : ""}${money(dayPnl, accountCurrency)}`} color={dayPnl === null ? C.muted : changeColor(dayPnl)} /></View></View></View>
    <AssetCurve snapshots={account.snapshots} currentTotal={totalAssets} />
    {orderFeedback ? <View testID="trade-order-feedback" style={[orderFeedbackStyles.container, orderFeedback.tone === "success" ? orderFeedbackStyles.success : orderFeedbackStyles.error]}><Text style={[orderFeedbackStyles.text, { color: orderFeedback.tone === "success" ? C.lime : C.magenta }]}>{orderFeedback.message}</Text></View> : null}
    <SectionTitle code="04 / ORDER" title="交易委托" action={selected?.symbol ?? "SELECT SYMBOL"} />
    <View style={styles.orderPanel}><View><Text style={styles.orderSymbol}>{selected?.displayName || selected?.symbol || "未选择"}</Text><Text style={styles.orderPrice}>{selected ? `${selected.symbol} · 最新可用价 ${quoteMoney(selected)} · ${selected.source}` : "请在行情页选择标的"}</Text></View><View style={styles.orderButtons}><Pressable testID="trade-buy-action" disabled={!selected} onPress={() => openOrderModal("BUY")} style={({ pressed }) => [styles.buyButton, (!selected || pressed) && styles.pressed]}><Text style={styles.buyText}>买入</Text></Pressable><Pressable testID="trade-sell-action" disabled={!selected} onPress={() => openOrderModal("SELL")} style={({ pressed }) => [styles.sellButton, (!selected || pressed) && styles.pressed]}><Text style={styles.sellText}>卖出</Text></Pressable></View></View>
    <SectionTitle code="05 / POSITION" title="持仓" action={`${account.positions.length} POSITIONS`} />
    {account.positions.length ? <View style={styles.listPanel}>{account.positions.map((position) => { const quote = quotes.find((item) => item.symbol === position.symbol); const stored = persistedInstrument(position); const current = markedPrice(position, quotes); const currency = quote?.currency ?? stored.currency; const pnl = (current - position.averageCost) * position.quantity; const sellable = sellableQuantity(position, marketRulesEnabled); const markText = quote ? "当前报价" : position.lastPriceTimestamp ? `最近标记 ${new Date(position.lastPriceTimestamp * 1000).toLocaleString()}` : "按成本暂估"; return <View testID={`position-${position.symbol}`} style={styles.positionRow} key={position.symbol}><Pressable onPress={() => onOpenPositionDetails(position.symbol)} style={({ pressed }) => [styles.positionInfo, pressed && styles.pressed]}><Text style={styles.rowSymbol}>{quote?.displayName || stored.displayName}</Text><Text style={styles.rowMeta}>{position.symbol} · {position.quantity} 股 · 成本 {money(position.averageCost, currency)} · {markText}</Text>{marketRulesEnabled && position.market === "A_SHARE" && sellable < position.quantity ? <Text style={marketRulesStyles.positionRuleCopy}>A 股可卖 {sellable} 股；当日买入部分待下一交易日解锁</Text> : null}<Text style={[styles.rowMeta, { color: C.cyan, marginTop: 7 }]}>点击查看股票详情</Text></Pressable><View style={{ alignItems: "flex-end", gap: 7 }}><Text style={styles.rowPrice}>{money(current * position.quantity, currency)}</Text><Text style={[styles.rowChange, { color: changeColor(pnl) }]}>{pnl >= 0 ? "+" : ""}{money(pnl, currency)}</Text><View style={styles.positionActions}><Pressable testID={`position-buy-${position.symbol}`} onPress={() => { void openPositionOrder("BUY", position); }} style={({ pressed }) => [styles.positionBuy, pressed && styles.pressed]}><Text style={styles.positionBuyText}>买入</Text></Pressable><Pressable testID={`position-sell-${position.symbol}`} onPress={() => { void openPositionOrder("SELL", position); }} style={({ pressed }) => [styles.positionSell, pressed && styles.pressed]}><Text style={styles.positionSellText}>卖出</Text></Pressable></View></View></View>; })}</View> : <View style={styles.emptyPanel}><Text style={styles.emptyTitle}>暂无持仓</Text><Text style={styles.emptyCopy}>成交后会保存持仓成本、浮动盈亏和交易复盘。</Text></View>}
    <SectionTitle code="06 / REVIEW" title="交易历史" action={`${account.trades.length} FILLS · ${pagedTrades.page}/${pagedTrades.totalPages}`} />
    {account.trades.length ? <><View style={styles.listPanel}>{pagedTrades.entries.map((trade) => { const stored = persistedInstrument(trade); return <View testID="trade-history-row" style={styles.tradeRow} key={trade.id}><Text style={[styles.tradeSide, { color: trade.side === "BUY" ? C.red : C.lime }]}>{trade.side === "BUY" ? "BUY" : "SELL"}</Text><View style={{ flex: 1 }}><Text style={styles.tradeSymbol}>{stored.displayName}</Text><Text style={styles.tradeMeta}>{trade.symbol} · {new Date(trade.executedAt).toLocaleString()} · {trade.quantity} 股 @ {money(trade.price, stored.currency)}</Text></View><Text style={[styles.tradeMeta, { color: changeColor(trade.realizedPnl) }]}>{trade.side === "SELL" ? `实现 ${trade.realizedPnl >= 0 ? "+" : ""}${money(trade.realizedPnl, stored.currency)}` : "建仓"}</Text></View>; })}</View>{pagedTrades.totalPages > 1 ? <View style={tradeHistoryStyles.pager}><Pressable testID="trade-history-previous-page" disabled={pagedTrades.page === 1} onPress={() => setTradeHistoryPage((page) => Math.max(1, page - 1))} style={[tradeHistoryStyles.pageButton, pagedTrades.page === 1 && styles.disabledButton]}><Text style={tradeHistoryStyles.pageButtonText}>上一页</Text></Pressable><Text testID="trade-history-page-label" style={tradeHistoryStyles.pageLabel}>第 {pagedTrades.page} / {pagedTrades.totalPages} 页 · 每页 7 条</Text><Pressable testID="trade-history-next-page" disabled={pagedTrades.page === pagedTrades.totalPages} onPress={() => setTradeHistoryPage((page) => Math.min(pagedTrades.totalPages, page + 1))} style={[tradeHistoryStyles.pageButton, pagedTrades.page === pagedTrades.totalPages && styles.disabledButton]}><Text style={tradeHistoryStyles.pageButtonText}>下一页</Text></Pressable></View> : null}</> : <View style={styles.emptyPanel}><Text style={styles.emptyTitle}>暂无成交</Text><Text style={styles.emptyCopy}>成交后会记录时间、数量、成交价和已实现盈亏。</Text></View>}
    <Pressable onPress={onReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetText}>重置账户</Text></Pressable>
    <Modal transparent visible={modal !== null} animationType="fade" onRequestClose={() => { orderSubmittingRef.current = false; setModal(null); }}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalCode}>ORDER // CONFIRM</Text><Text style={styles.modalTitle}>{modal?.side === "BUY" ? "买入" : "卖出"} {orderQuote?.displayName || orderQuote?.symbol || modal?.symbol}</Text><Text style={styles.modalWarning}>{orderQuote ? `将按 ${orderQuote.source} 的最新可用价 ${quoteMoney(orderQuote)} 进行本地账户计算。` : "当前持仓未加载可用报价；请返回行情页刷新后再操作。"}</Text><Text style={{ color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }}>委托数量（股）</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" style={styles.quantityInput} /><View style={{ flexDirection: "row", gap: 8 }}>{[100, 200, 500].map((value) => <Pressable key={value} onPress={() => setQuantity(String(value))} style={({ pressed }) => [{ flex: 1, height: 36, borderWidth: 1, borderColor: quantity === String(value) ? C.cyan : C.line, backgroundColor: quantity === String(value) ? "#00F0FF18" : "transparent", justifyContent: "center", alignItems: "center" }, pressed && styles.pressed]}><Text style={{ color: quantity === String(value) ? C.cyan : C.muted, fontSize: 11, fontWeight: "800" }}>{value} 股</Text></Pressable>)}</View><Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>默认 100 股；可一键选择 100、200 或 500 股，也可输入其他正整数数量。</Text><View style={styles.modalActions}><Pressable onPress={() => { orderSubmittingRef.current = false; setModal(null); }} style={styles.cancelButton}><Text style={styles.cancelText}>取消</Text></Pressable><Pressable testID="trade-confirm-order" disabled={!orderQuote} onPress={submit} style={[styles.confirmButton, !orderQuote && styles.disabledButton]}><Text style={styles.confirmText}>确认委托</Text></Pressable></View></View></View></Modal>
  </ScrollView>;
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, color ? { color } : undefined]}>{value}</Text></View>; }

function AboutScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ ABOUT / FIN•SCOPE ]</Text><Tag>LOCAL TERMINAL</Tag></View>
    <View style={styles.researchTarget}><Text style={styles.sectionCode}>FIN•SCOPE</Text><Text style={styles.researchSymbol}>模拟交易终端</Text><Text style={styles.researchPrice}>市场观察 · 学习研究 · 本地模拟账户</Text></View>
    <SectionTitle code="01 / FEATURES" title="当前功能" />
    <View style={styles.listPanel}>{ABOUT_FEATURES.map(([title, copy]) => <View key={title} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.line, gap: 5 }}><Text style={{ color: C.white, fontSize: 14, fontWeight: "800" }}>{title}</Text><Text style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>{copy}</Text></View>)}</View>
    <SectionTitle code="02 / NOTES" title="使用注意事项" />
    <View style={styles.riskBanner}><MaterialCommunityIcons name="shield-alert-outline" size={21} color={C.magenta} /><Text style={styles.riskText}>{ABOUT_NOTICE}</Text></View>
    <View style={styles.disabledProvider}><MaterialCommunityIcons name="database-lock-outline" size={18} color={C.cyan} /><Text style={styles.disabledProviderText}>自选、账户、持仓、交易流水与个人数据源凭证保存在当前设备或 WebView 本地存储中。清除应用数据、重置账户或卸载应用可能导致本地数据不可恢复。</Text></View>
    <SectionTitle code="03 / DEVELOPER" title="开发者" action="DLMILY" />
    <View style={styles.compatPanel}><Text style={styles.compatTitle}>{ABOUT_DEVELOPER}</Text><Text style={styles.compatCopy}>独立开发与维护。当前版本为测试用途的本地模拟交易终端。</Text></View>
    <SectionTitle code="04 / TERMS" title="用户条款" action="IN-APP NOTICE" />
    <View style={styles.answerPanel}><Text style={styles.answerText}>{ABOUT_TERMS}</Text><Text style={styles.answerSource}>本页面是应用内使用说明，不能替代针对具体业务、地区或监管要求的法律意见。</Text></View>
    <Pressable onPress={onOpenSettings} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><MaterialCommunityIcons name="tune-variant" size={18} color={C.ink} /><Text style={styles.primaryButtonText}>打开数据源与账户设置</Text></Pressable>
  </ScrollView>;
}

export function SettingsScreen({ marketSource, provider, hasKey, keyMask, onSaveKey, onClearKey, onSelectSource, onResetAccount, marketRulesEnabled = DEFAULT_MARKET_RULES_ENABLED, onToggleMarketRules = () => undefined, widgetOrderQuantity = 1, onWidgetOrderQuantityChange = () => undefined }: { marketSource: MarketSourceId; provider: DeviceMarketProvider; hasKey: boolean; keyMask: string; onSaveKey: (key: string) => Promise<void>; onClearKey: () => void; onSelectSource: (source: MarketSourceId) => void; onResetAccount: () => void; marketRulesEnabled?: boolean; onToggleMarketRules?: (enabled: boolean) => void; widgetOrderQuantity?: number; onWidgetOrderQuantityChange?: (quantity: number) => void }) {
  const [key, setKey] = useState("");
  const [widgetQuantityInput, setWidgetQuantityInput] = useState(String(widgetOrderQuantity));
  useEffect(() => { setWidgetQuantityInput(String(widgetOrderQuantity)); }, [widgetOrderQuantity]);
  const commitWidgetQuantity = () => { const parsed = Number(widgetQuantityInput); if (Number.isInteger(parsed) && parsed > 0) onWidgetOrderQuantityChange(parsed); else { setWidgetQuantityInput(String(widgetOrderQuantity)); Alert.alert("数量无效", "小组件默认数量需为正整数。 "); } };
  const openOfficialCredentialLink = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert("无法打开链接", "请检查网络后重试，或复制链接在浏览器中打开。")); };
  const storageBoundary = Platform.OS === "web"
    ? "当前为 Web/WebView 测试运行时：数据 Token、自选与模拟账户使用本地 Web 存储，安全性低于原生系统安全存储；请仅用于内测，不要导入生产凭证。"
    : "个人数据 Token、自选、虚拟账户、持仓和交易流水仅保存在当前设备。此版本不登录、不跨设备同步，也不会向服务器上传密钥或提交真实订单。";
  return <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
    <View style={styles.heroLine}><Text style={styles.terminalPath}>[ SETTINGS / DATA ADAPTER ]</Text><Tag tone={hasKey ? "cyan" : "magenta"}>{provider.requiresCredential ? (hasKey ? "TOKEN STORED" : "NO TOKEN") : "NO SIGNUP"}</Tag></View>
    <SectionTitle code="07 / MODE" title="设备本地模式" action="LOCAL ONLY" />
    <View style={styles.disabledProvider}><MaterialCommunityIcons name="cellphone-lock" size={18} color={C.cyan} /><Text style={styles.disabledProviderText}>{storageBoundary}</Text></View>
    <SectionTitle code="07 / PROVIDER" title="行情数据供应商" action="可切换" />
    <Pressable onPress={() => onSelectSource("TENCENT")} style={({ pressed }) => [styles.providerCard, marketSource === "TENCENT" && domesticStyles.providerSelected, pressed && styles.pressed]}><View style={[styles.providerBadge, { backgroundColor: marketSource === "TENCENT" ? C.cyan : C.panel2 }]}><Text style={[styles.providerBadgeText, marketSource !== "TENCENT" && { color: C.cyan }]}>TX</Text></View><View style={{ flex: 1 }}><Text style={styles.providerTitle}>公开行情测试源</Text><Text style={styles.providerCopy}>默认无需注册，基于实测公开延时响应显示 A 股、指数与港股。未找到面向第三方的公开字段文档、SLA 或商业展示授权；仅供内测学习。</Text></View><Tag tone={marketSource === "TENCENT" ? "cyan" : "muted"}>{marketSource === "TENCENT" ? "DEFAULT" : "SELECT"}</Tag></Pressable>
    <Pressable onPress={() => onSelectSource("TUSHARE")} style={({ pressed }) => [styles.providerCard, marketSource === "TUSHARE" && domesticStyles.providerSelected, pressed && styles.pressed]}><View style={[styles.providerBadge, { backgroundColor: marketSource === "TUSHARE" ? C.cyan : C.panel2 }]}><Text style={[styles.providerBadgeText, marketSource !== "TUSHARE" && { color: C.cyan }]}>TS</Text></View><View style={{ flex: 1 }}><Text style={styles.providerTitle}>Tushare Pro</Text><Text style={styles.providerCopy}>A 股、港股与国内指数优先。实时日线、分钟与部分港股能力取决于你的 Token 权限；无权限时会回退至最近可用日线。</Text></View><Tag tone={marketSource === "TUSHARE" ? "cyan" : "muted"}>{marketSource === "TUSHARE" ? "ACTIVE" : "SELECT"}</Tag></Pressable>
    <Pressable onPress={() => onSelectSource("FINNHUB")} style={({ pressed }) => [styles.providerCard, marketSource === "FINNHUB" && domesticStyles.providerSelected, pressed && styles.pressed]}><View style={[styles.providerBadge, { backgroundColor: marketSource === "FINNHUB" ? C.cyan : C.panel2 }]}><Text style={[styles.providerBadgeText, marketSource !== "FINNHUB" && { color: C.cyan }]}>FH</Text></View><View style={{ flex: 1 }}><Text style={styles.providerTitle}>Finnhub</Text><Text style={styles.providerCopy}>保留为美股与已覆盖海外市场选项，支持报价、K 线、企业资料与公司新闻，能力以你的套餐为准。</Text></View><Tag tone={marketSource === "FINNHUB" ? "cyan" : "muted"}>{marketSource === "FINNHUB" ? "ACTIVE" : "SELECT"}</Tag></Pressable>
    <View style={styles.disabledProvider}><MaterialCommunityIcons name="shield-lock-outline" size={18} color={C.muted} /><Text style={styles.disabledProviderText}>参考小程序的数据接口不会被抓取、逆向或重放。只有供应方提供明确公开授权的接口后，才会新增可选适配器。</Text></View>
    <SectionTitle code="08 / ACCESS" title={provider.requiresCredential ? `导入个人 ${provider.keyLabel}` : "免注册公开行情"} />
    {provider.requiresCredential ? <><Text style={styles.settingCopy}>Token 仅保存在当前设备，用于从设备直接请求 {provider.label}；完整 Token 不会回显、上传或提供查看入口。{hasKey ? ` 当前设备已保存 Token（${keyMask}）；如需替换，请粘贴新 Token。` : " 保存后将立即校验一个真实标的。"}</Text>{!hasKey && provider.credentialHelp ? <View testID="credential-registration-guidance" style={credentialHelpStyles.guidance}><Text style={credentialHelpStyles.guidanceText}>{marketSource === "FINNHUB" ? "尚未配置 Finnhub API Key。请先注册并登录，再在 Dashboard 获取 API Key。" : "尚未配置 Tushare Token。请先注册并登录，再从个人中心的“账号与TOKEN”复制 Token。"}</Text><View style={credentialHelpStyles.linkRow}><Pressable testID="credential-register-link" onPress={() => openOfficialCredentialLink(provider.credentialHelp!.registrationUrl)} style={credentialHelpStyles.linkButton}><Text style={credentialHelpStyles.linkText}>{provider.credentialHelp.registrationLabel}</Text></Pressable>{provider.credentialHelp.credentialGuideUrl ? <Pressable testID="credential-guide-link" onPress={() => openOfficialCredentialLink(provider.credentialHelp!.credentialGuideUrl!)} style={credentialHelpStyles.linkButton}><Text style={credentialHelpStyles.linkText}>{provider.credentialHelp.credentialGuideLabel}</Text></Pressable> : null}</View></View> : null}<View style={styles.keyInputWrap}><TextInput value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={hasKey ? "粘贴新 Token 以替换当前凭证" : `粘贴你的 ${provider.keyLabel}`} placeholderTextColor={C.muted} style={styles.keyInput} /></View><Pressable onPress={async () => { await onSaveKey(key); setKey(""); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><MaterialCommunityIcons name="content-save-outline" size={18} color={C.ink} /><Text style={styles.primaryButtonText}>{hasKey ? "替换并校验" : "安全保存并校验"}</Text></Pressable>{hasKey ? <Pressable onPress={onClearKey} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetText}>移除设备中的 {provider.keyLabel}</Text></Pressable> : null}</> : <View style={styles.disabledProvider}><MaterialCommunityIcons name="information-outline" size={18} color={C.cyan} /><Text style={styles.disabledProviderText}>当前默认源不要求账号、手机号或 Token。它基于实测公开延时响应加载报价与日线，但没有面向第三方的公开字段文档或 SLA；仅用于内测学习，请以供应商时间戳为准。</Text></View>}
    <SectionTitle code="09 / MARKET RULES" title="市场交易规则" action={marketRulesEnabled ? "ON" : "OFF"} />
    <View testID="market-rules-setting" style={marketRulesStyles.card}><View style={marketRulesStyles.switchRow}><View style={{ flex: 1 }}><Text style={marketRulesStyles.title}>按市场规则限制卖出</Text><Text style={marketRulesStyles.copy}>{marketRuleSummary(marketRulesEnabled)}</Text></View><Switch testID="market-rules-toggle" value={marketRulesEnabled} onValueChange={onToggleMarketRules} trackColor={{ false: C.line, true: C.cyan + "99" }} thumbColor={marketRulesEnabled ? C.cyan : C.muted} /></View><View style={marketRulesStyles.ruleRows}><Text style={marketRulesStyles.rule}>A 股：T+1 卖出；当日买入部分在下一个工作日 09:30 后可卖。</Text><Text style={marketRulesStyles.rule}>美股：允许当日买卖；交收周期不在本地账户中模拟。</Text><Text style={marketRulesStyles.rule}>港股：允许当日买卖；交收周期不在本地账户中模拟。</Text></View></View>
    <SectionTitle code="10 / WIDGET" title="桌面小组件" action={`${widgetOrderQuantity} 股`} />
    <View testID="widget-default-quantity-setting" style={marketRulesStyles.card}><Text style={marketRulesStyles.title}>小组件默认买入/卖出数量</Text><Text style={marketRulesStyles.copy}>正方形和长方形小组件的买入、卖出按钮均使用此数量；默认 1 股。小组件先打开应用，再按当前本地账户、报价与市场规则执行。</Text><TextInput testID="widget-default-quantity-input" value={widgetQuantityInput} onChangeText={setWidgetQuantityInput} onBlur={commitWidgetQuantity} onSubmitEditing={commitWidgetQuantity} keyboardType="number-pad" placeholder="1" placeholderTextColor={C.muted} style={styles.keyInput} /></View>
    <SectionTitle code="11 / COMPATIBILITY" title="跨端计划" />
    <View style={styles.compatPanel}><Text style={styles.compatTitle}>iOS / ANDROID</Text><Text style={styles.compatCopy}>首发使用 React Native/Expo 原生 App；交易、账户与密钥逻辑保持跨端边界。</Text><Text style={styles.compatTitle}>HARMONYOS NEXT</Text><Text style={styles.compatCopy}>预留 React Native OpenHarmony / ArkTS 适配路径。HarmonyOS NEXT 需要独立构建与真机验证，不能直接使用 Android 安装包。</Text></View>
    <SectionTitle code="12 / ACCOUNT" title="本地账户" action="RESET" />
    <View style={styles.disabledProvider}><MaterialCommunityIcons name="database-refresh-outline" size={18} color={C.muted} /><Text style={styles.disabledProviderText}>重置会清除本设备的账户余额、持仓、交易记录与资产快照，且无法恢复。</Text></View>
    <Pressable onPress={onResetAccount} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text style={styles.resetText}>重置账户</Text></Pressable>
    <View style={styles.riskBanner}><MaterialCommunityIcons name="shield-alert-outline" size={21} color={C.magenta} /><Text style={styles.riskText}>虚拟资金，非真实交易。任何买卖仅影响本设备的模拟账户，不会向券商、交易所或第三方下单。</Text></View>
  </ScrollView>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("watchlist");
  const [marketSource, setMarketSource] = useState<MarketSourceId>("TENCENT");
  const [apiKey, setApiKey] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [companyResearch, setCompanyResearch] = useState<CompanyResearchData | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchSeedQuestion, setResearchSeedQuestion] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [showFirstLaunchRisk, setShowFirstLaunchRisk] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [marketRulesEnabled, setMarketRulesEnabled] = useState(DEFAULT_MARKET_RULES_ENABLED);
  const [widgetOrderQuantity, setWidgetOrderQuantity] = useState(1);
  const [widgetOrderSignal, setWidgetOrderSignal] = useState(0);
  const [sourceHydrated, setSourceHydrated] = useState(false);
  const [foregroundRefreshVersion, setForegroundRefreshVersion] = useState(0);
  const [portfolioQuoteRefreshStatus, setPortfolioQuoteRefreshStatus] = useState<PortfolioQuoteRefreshStatus>("idle");
  const [lastSuccessfulPortfolioQuoteRefreshAt, setLastSuccessfulPortfolioQuoteRefreshAt] = useState<number | null>(null);
  const [account, setAccount] = useState<PaperAccount>({ initialCash: STARTING_CASH, cash: STARTING_CASH, positions: [], trades: [], snapshots: [{ totalAssets: STARTING_CASH, capturedAt: Date.now() }] });
  const launchOpacity = useRef(new Animated.Value(0)).current;
  const pageOpacity = useRef(new Animated.Value(0)).current;
  const pageTranslateY = useRef(new Animated.Value(0)).current;
  const quoteRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const marketSourceVersion = useRef(0);
  const appState = useRef(AppState.currentState);
  const processedWidgetOrderId = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 720;

  const selected = useMemo(() => quotes.find((quote) => quote.symbol === selectedSymbol) ?? quotes[0], [quotes, selectedSymbol]);
  const provider = useMemo(() => getDeviceMarketProvider(marketSource), [marketSource]);
  const hasProviderAccess = !provider.requiresCredential || Boolean(apiKey);
  useEffect(() => { if (!storageReady) return; Animated.timing(launchOpacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start(); }, [launchOpacity, storageReady]);
  useLayoutEffect(() => { if (!storageReady) return; pageOpacity.stopAnimation(); pageTranslateY.stopAnimation(); pageOpacity.setValue(0.94); pageTranslateY.setValue(5); Animated.parallel([Animated.timing(pageOpacity, { toValue: 1, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }), Animated.timing(pageTranslateY, { toValue: 0, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" })]).start(); }, [activeTab, pageOpacity, pageTranslateY, storageReady]);
  const navigateTo = (tab: Tab) => {
    if (tab === activeTab) return;
    pageOpacity.stopAnimation();
    Animated.timing(pageOpacity, { toValue: 0, duration: 70, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start(({ finished }) => { if (finished) setActiveTab(tab); });
  };
  const loadSelectedDetails = async (symbol: string, token: string, activeProvider = provider, sourceVersion = marketSourceVersion.current) => {
    const requestVersion = ++detailRequestVersion.current;
    setCandles([]);
    setIntraday([]);
    setChartError(null);
    setDetailsLoading(true);
    setResearchLoading(true);
    setResearchError(null);
    const [candlesResult, intradayResult, researchResult] = await Promise.allSettled([
      activeProvider.getCandles(symbol, token),
      activeProvider.getIntraday ? activeProvider.getIntraday(symbol, token) : Promise.resolve([]),
      activeProvider.getCompanyResearch(symbol, token),
    ]);
    if (detailRequestVersion.current !== requestVersion || marketSourceVersion.current !== sourceVersion) return;
    setCandles(candlesResult.status === "fulfilled" ? candlesResult.value : []);
    setIntraday(intradayResult.status === "fulfilled" ? intradayResult.value : []);
    const chartFailures = [candlesResult, intradayResult].filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : "图表数据请求失败");
    setChartError(chartFailures.length ? chartFailures.join("；") : null);
    if (researchResult.status === "fulfilled") setCompanyResearch(researchResult.value);
    else { setCompanyResearch(null); setResearchError(researchResult.reason instanceof Error ? researchResult.reason.message : "未知数据错误"); }
    setResearchLoading(false);
    setDetailsLoading(false);
  };

  useEffect(() => { (async () => {
    const [savedSource, savedAccount, riskConfirmed, savedMarketRules, savedWidgetQuantity] = await Promise.all([AsyncStorage.getItem(MARKET_SOURCE_KEY), AsyncStorage.getItem(VAULT_KEY), AsyncStorage.getItem(FIRST_LAUNCH_RISK_KEY), AsyncStorage.getItem(MARKET_TRADING_RULES_STORAGE_KEY), AsyncStorage.getItem(WIDGET_DEFAULT_QUANTITY_KEY)]);
    const source = resolveSavedMarketSource(savedSource);
    if (savedAccount) {
      const parsed = JSON.parse(savedAccount) as PaperAccount;
      setAccount({ ...parsed, snapshots: Array.isArray(parsed.snapshots) && parsed.snapshots.length ? parsed.snapshots : [{ totalAssets: parsed.cash ?? STARTING_CASH, capturedAt: Date.now() }] });
    }
    setMarketSource(source);
    setMarketRulesEnabled(savedMarketRules !== "disabled");
    const normalizedWidgetQuantity = Number(savedWidgetQuantity);
    setWidgetOrderQuantity(Number.isInteger(normalizedWidgetQuantity) && normalizedWidgetQuantity > 0 ? normalizedWidgetQuantity : 1);
    setShowFirstLaunchRisk(riskConfirmed !== "confirmed");
    setStorageReady(true);
  })(); }, []);
  useEffect(() => { if (!storageReady) return; (async () => {
    const sourceVersion = ++marketSourceVersion.current;
    setSourceHydrated(false);
    quoteRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    const activeProvider = getDeviceMarketProvider(marketSource);
    const [storedKey, savedWatchlist] = await Promise.all([loadMarketCredential(marketSource), AsyncStorage.getItem(watchlistStorageKey(marketSource))]);
    const parsed = savedWatchlist ? JSON.parse(savedWatchlist) as unknown : null;
    const nextWatchlist = Array.isArray(parsed) && parsed.length && parsed.every((item) => typeof item === "string") ? parsed : activeProvider.defaultSymbols;
    if (marketSourceVersion.current !== sourceVersion) return;
    setApiKey(storedKey ?? "");
    setWatchlistSymbols(nextWatchlist);
    setQuotes([]);
    setCandles([]);
    setIntraday([]);
    setChartError(null);
    setDetailsLoading(false);
    setCompanyResearch(null);
    setResearchError(null);
    setSearchResults([]);
    setSelectedSymbol(undefined);
    await AsyncStorage.setItem(MARKET_SOURCE_KEY, marketSource);
    if (marketSourceVersion.current === sourceVersion) setSourceHydrated(true);
  })(); }, [marketSource, storageReady]);
  useEffect(() => { if (storageReady) AsyncStorage.setItem(VAULT_KEY, JSON.stringify(account)); }, [account, storageReady]);
  useEffect(() => { if (storageReady) AsyncStorage.setItem(MARKET_TRADING_RULES_STORAGE_KEY, marketRulesEnabled ? "enabled" : "disabled"); }, [marketRulesEnabled, storageReady]);
  useEffect(() => { if (storageReady) AsyncStorage.setItem(WIDGET_DEFAULT_QUANTITY_KEY, String(widgetOrderQuantity)); }, [storageReady, widgetOrderQuantity]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = nextState === "active" && appState.current !== "active";
      appState.current = nextState;
      if (resumed) setForegroundRefreshVersion((version) => version + 1);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const refreshFromNativeForegroundTimer = () => setForegroundRefreshVersion((version) => version + 1);
    const receiveWidgetOrder = () => setWidgetOrderSignal((version) => version + 1);
    window.addEventListener("finscopeForegroundQuoteRefresh", refreshFromNativeForegroundTimer);
    window.addEventListener("finscopeWidgetOrder", receiveWidgetOrder);
    return () => { window.removeEventListener("finscopeForegroundQuoteRefresh", refreshFromNativeForegroundTimer); window.removeEventListener("finscopeWidgetOrder", receiveWidgetOrder); };
  }, []);
  useEffect(() => { if (storageReady) AsyncStorage.setItem(watchlistStorageKey(marketSource), JSON.stringify(watchlistSymbols)); }, [watchlistSymbols, marketSource, storageReady]);
  useEffect(() => {
    if (!quotes.length) return;
    setAccount((previous) => {
      const marked = mergePositionMarks(previous.positions, quotes);
      return marked.changed ? { ...previous, positions: marked.positions } : previous;
    });
  }, [quotes]);

  const refreshQuotes = async (symbols = watchlistSymbols, token = apiKey, sourceVersion = marketSourceVersion.current, silent = false) => {
    if (provider.requiresCredential && !token) { setPortfolioQuoteRefreshStatus("failed"); if (!silent) { Alert.alert("需要数据 Token", `请在设置中导入个人 ${provider.keyLabel}。`); navigateTo("settings"); } return; }
    const requestVersion = ++quoteRequestVersion.current;
    try { setRefreshing(true); if (account.positions.length) setPortfolioQuoteRefreshStatus("refreshing"); const result = await Promise.allSettled(symbols.map((symbol) => provider.getQuote(symbol, token))); if (quoteRequestVersion.current !== requestVersion || marketSourceVersion.current !== sourceVersion) return; const usable = result.filter((item): item is PromiseFulfilledResult<Quote> => item.status === "fulfilled").map((item) => item.value); if (!usable.length) throw new Error(provider.requiresCredential ? "未获得可用报价，请检查 Token 权限与当前市场覆盖。" : "未获得公开延时行情，请检查网络后重试。"); const positionStatus = resolvePortfolioQuoteRefreshStatus(account.positions.map((position) => position.symbol), usable.map((quote) => quote.symbol)); setPortfolioQuoteRefreshStatus(positionStatus); if (positionStatus === "updated" || positionStatus === "partial") setLastSuccessfulPortfolioQuoteRefreshAt(Date.now()); setQuotes((previous) => { const rest = previous.filter((quote) => !symbols.includes(quote.symbol)); return [...usable, ...rest]; }); const nextSymbol = usable.find((item) => item.symbol === selectedSymbol)?.symbol ?? preferredTradeSymbol(usable, account.cash); setSelectedSymbol(nextSymbol); if (nextSymbol) await loadSelectedDetails(nextSymbol, token, provider, sourceVersion); } catch (error) { if (account.positions.length) setPortfolioQuoteRefreshStatus("failed"); if (!silent && marketSourceVersion.current === sourceVersion) Alert.alert("数据连接失败", error instanceof Error ? error.message : provider.requiresCredential ? `请检查 ${provider.keyLabel}、网络和供应商权限。` : "请检查网络后重试公开延时行情。"); } finally { if (quoteRequestVersion.current === requestVersion && marketSourceVersion.current === sourceVersion) setRefreshing(false); }
  };
  useEffect(() => { if (!storageReady || !sourceHydrated || (provider.requiresCredential && !apiKey)) return; refreshQuotes(watchlistSymbols, apiKey, marketSourceVersion.current); }, [storageReady, sourceHydrated, marketSource]);
  useEffect(() => {
    if (!shouldRefreshPortfolioQuotes({ activeTab, foregroundRefreshVersion: 0, hasApiKey: Boolean(apiKey), hasPositions: Boolean(account.positions.length), providerRequiresCredential: provider.requiresCredential, sourceHydrated, storageReady })) return;
    void refreshQuotes(watchlistSymbols, apiKey, marketSourceVersion.current, true);
  }, [activeTab, account.positions.length, apiKey, marketSource, sourceHydrated, storageReady]);
  useEffect(() => {
    if (!shouldRefreshPortfolioQuotes({ activeTab, foregroundRefreshVersion, hasApiKey: Boolean(apiKey), hasPositions: Boolean(account.positions.length), providerRequiresCredential: provider.requiresCredential, sourceHydrated, storageReady })) return;
    void refreshQuotes(watchlistSymbols, apiKey, marketSourceVersion.current, true);
  }, [account.positions.length, apiKey, foregroundRefreshVersion, marketSource, sourceHydrated, storageReady]);

  const saveKey = async (value: string) => {
    const normalized = value.trim();
    if (!provider.requiresCredential) { await refreshQuotes(provider.defaultSymbols, ""); return; }
    if (normalized.length < 8) { Alert.alert("Token 格式无效", `请粘贴有效的 ${provider.keyLabel}。`); return; }
    try { setRefreshing(true); await provider.getQuote(provider.validationSymbol, normalized); await saveMarketCredential(marketSource, normalized); setApiKey(normalized); setWatchlistSymbols(provider.defaultSymbols); Alert.alert("Token 已安全保存", `已验证可获取 ${provider.label} 真实行情。现在将载入默认市场观察列表。`); await refreshQuotes(provider.defaultSymbols, normalized); navigateTo("watchlist"); } catch (error) { Alert.alert("验证失败", error instanceof Error ? error.message : `无法使用该 ${provider.keyLabel} 获取真实报价，请检查 Token 状态和供应商权限。`); } finally { setRefreshing(false); }
  };
  const clearKey = async () => { await removeMarketCredential(marketSource); setApiKey(""); setQuotes([]); setCandles([]); setCompanyResearch(null); setResearchError(null); setSelectedSymbol(undefined); Alert.alert("Token 已移除", `设备不再保存你的 ${provider.keyLabel}。`); };
  const selectQuote = async (quote: Quote) => { quoteRequestVersion.current += 1; setSelectedSymbol(quote.symbol); navigateTo("watchlist"); if (hasProviderAccess) await loadSelectedDetails(quote.symbol, apiKey, provider, marketSourceVersion.current); };
  const searchSymbol = async (raw: string) => { const query = raw.trim(); if (!query || !hasProviderAccess) return; try { setSearching(true); setSearchError(null); const next = await provider.searchSymbols(query, apiKey); setSearchResults(next); if (!next.length) setSearchError(`未找到“${query}”的可用结果。公开测试源仅覆盖内置标的与标准代码；请尝试代码或其他已覆盖标的。`); } catch (error) { const message = error instanceof Error ? error.message : provider.requiresCredential ? `请检查 ${provider.keyLabel} 与供应商权限。` : "请检查网络后重试公开行情检索。"; setSearchResults([]); setSearchError(message); } finally { setSearching(false); } };
  const openStockDetails = async (rawSymbol: string, announceAddition = false) => { const action = prepareStockDetailAction(rawSymbol, watchlistSymbols); if (!action || !hasProviderAccess) return; const { symbol, nextWatchlist } = action; const requestVersion = ++quoteRequestVersion.current; const sourceVersion = marketSourceVersion.current; setWatchlistSymbols(nextWatchlist); try { setDetailsLoading(true); const quote = await provider.getQuote(symbol, apiKey); if (quoteRequestVersion.current !== requestVersion || marketSourceVersion.current !== sourceVersion) return; setQuotes((current) => [quote, ...current.filter((item) => item.symbol !== symbol)]); setSelectedSymbol(symbol); await loadSelectedDetails(symbol, apiKey, provider, sourceVersion); navigateTo("watchlist"); if (announceAddition && nextWatchlist.length > watchlistSymbols.length) Alert.alert("已加入自选", `${quote.displayName || symbol} 已加入当前数据源的本地自选。`); } catch (error) { if (marketSourceVersion.current === sourceVersion) Alert.alert("标的载入失败", error instanceof Error ? error.message : "未获得可用公开行情。"); } finally { if (marketSourceVersion.current === sourceVersion) setDetailsLoading(false); } };
  const openResearchFromNews = (headline: string) => { if (!selected) return; setResearchSeedQuestion(`请结合这条新闻解释 ${selected.symbol} 的学习研究要点：${headline}`); navigateTo("research"); };
  const removeSelectedFromWatchlist = () => { if (!selected) return; const nextSymbols = watchlistSymbols.filter((symbol) => symbol !== selected.symbol); setWatchlistSymbols(nextSymbols); setQuotes((current) => current.filter((quote) => quote.symbol !== selected.symbol)); setSelectedSymbol(nextSymbols[0]); setCandles([]); setIntraday([]); setCompanyResearch(null); };
  const resolvePositionQuote = async (position: PaperPosition): Promise<{ quote: Quote; sourceId: MarketSourceId } | null> => {
    const sourceId = inferredPositionSource(position);
    const positionProvider = getDeviceMarketProvider(sourceId);
    const token = sourceId === marketSource ? apiKey : (await loadMarketCredential(sourceId) ?? "");
    if (positionProvider.requiresCredential && !token) { Alert.alert("需要数据 Token", `该持仓来自 ${positionProvider.label}。请切换至该数据源并导入个人 ${positionProvider.keyLabel} 后再操作。`); return null; }
    try {
      const quote = await positionProvider.getQuote(position.symbol, token);
      setQuotes((current) => [quote, ...current.filter((item) => item.symbol !== quote.symbol)]);
      return { quote, sourceId };
    } catch (error) {
      Alert.alert("持仓报价不可用", error instanceof Error ? error.message : `无法从 ${positionProvider.label} 取得 ${position.symbol} 的可用报价。`);
      return null;
    }
  };
  const paperOrder = (side: Side, quantity: number, symbol: string, quoteOverride?: Quote, executionSourceId?: MarketSourceId) => {
    const executionQuote = quoteOverride?.symbol === symbol ? quoteOverride : resolveExecutableQuote(quotes, selected, symbol);
    if (!executionQuote) { Alert.alert("报价未加载", "当前标的没有可用于成交计算的有效价格；请返回自选页刷新后重试。 "); return false; }
    const existingPosition = account.positions.find((position) => position.symbol === executionQuote.symbol);
    if (side === "SELL" && marketSellRuleError(existingPosition, quantity, marketRulesEnabled)) { Alert.alert("A 股当日不可卖", `当日新买入的 A 股需在下一个工作日 09:30 后卖出；当前可卖 ${sellableQuantity(existingPosition!, marketRulesEnabled)} 股。可在设置中关闭“按市场规则限制卖出”以允许测试账户即时卖出。`); return false; }
    const preflight = paperOrderPreflight({ side, quantity, quote: executionQuote, cash: account.cash, holdingQuantity: existingPosition?.quantity ?? 0 });
    if (preflight === "missing-quote") { Alert.alert("报价未加载", "当前标的没有可用于成交计算的有效价格；请返回自选页刷新后重试。 "); return false; }
    if (preflight === "invalid-quantity") { Alert.alert("数量无效", "请输入正整数股数。 "); return false; }
    if (preflight === "insufficient-cash") { Alert.alert("可用资金不足", `买入 ${quantity} 股需 ${money(executionQuote.price * quantity, executionQuote.currency)}，可用现金为 ${money(account.cash, executionQuote.currency)}。`); return false; }
    if (preflight === "insufficient-holding") { Alert.alert("持仓不足", "卖出数量不能超过当前持仓。 "); return false; }
    setQuotes((current) => [executionQuote, ...current.filter((quote) => quote.symbol !== executionQuote.symbol)]);
    setSelectedSymbol(executionQuote.symbol);
    setAccount((previous) => {
      const withSnapshot = (next: Omit<PaperAccount, "snapshots">) => {
        const markedValue = next.positions.reduce((total, position) => total + markedPrice(position, quotes) * position.quantity, 0);
        return { ...next, snapshots: [...previous.snapshots, { totalAssets: Number((next.cash + markedValue).toFixed(2)), capturedAt: Date.now() }].slice(-60) };
      };
      const executedAt = Date.now();
      const applied = applyLocalPaperOrder(previous, { side, quantity, quote: executionQuote, id: `${executedAt}`, executedAt, sourceId: executionSourceId ?? marketSource, marketRulesEnabled });
      return withSnapshot({ ...previous, ...applied });
    });
    return true;
  };
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !storageReady) return;
    const bridge = (window as unknown as { FinscopeWidgetBridge?: { updateSnapshot?: (snapshot: string) => void } }).FinscopeWidgetBridge;
    if (!bridge?.updateSnapshot) return;
    const snapshot = buildWidgetPortfolioSnapshot({ positions: account.positions, quotes, selectedSymbol, intraday: intraday.map((point) => point.price), candles: candles.map((candle) => candle.close), defaultQuantity: widgetOrderQuantity });
    bridge.updateSnapshot(JSON.stringify(snapshot ?? {}));
  }, [account, candles, intraday, quotes, selectedSymbol, storageReady, widgetOrderQuantity]);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !storageReady) return;
    const bridge = (window as unknown as { FinscopeWidgetBridge?: { consumePendingOrder?: () => string; acknowledgeOrder?: (id: string) => void } }).FinscopeWidgetBridge;
    const rawOrder = bridge?.consumePendingOrder?.();
    if (!rawOrder) return;
    try {
      const request = JSON.parse(rawOrder) as { id?: string; side?: Side; symbol?: string; quantity?: number; price?: number; displayName?: string; currency?: MarketCurrency; market?: MarketScope; sourceId?: MarketSourceId };
      if (!request.id || processedWidgetOrderId.current === request.id) return;
      processedWidgetOrderId.current = request.id;
      const quantity = Math.max(1, Math.floor(Number(request.quantity) || widgetOrderQuantity));
      const isValid = (request.side === "BUY" || request.side === "SELL") && Boolean(request.symbol) && Number.isFinite(request.price) && (request.price ?? 0) > 0;
      const success = isValid && paperOrder(request.side!, quantity, request.symbol!, { symbol: request.symbol!, displayName: request.displayName ?? request.symbol!, price: request.price!, change: 0, changePercent: 0, previousClose: request.price!, timestamp: Math.floor(Date.now() / 1000), currency: request.currency ?? "CNY", market: request.market ?? "A_SHARE", assetType: "EQUITY", source: "桌面小组件" }, request.sourceId);
      bridge?.acknowledgeOrder?.(request.id);
      Alert.alert(success ? "小组件订单已执行" : "小组件订单未执行", success ? `${request.side === "BUY" ? "买入" : "卖出"} ${quantity} 股已写入本机账户。` : "请打开交易页面，检查持仓、规则限制、价格和可用资金。" );
    } catch {
      bridge?.acknowledgeOrder?.("");
    }
  }, [paperOrder, storageReady, widgetOrderQuantity, widgetOrderSignal]);
  const requestResetAccount = () => setShowResetConfirm(true);
  const confirmResetAccount = () => { setAccount({ initialCash: STARTING_CASH, cash: STARTING_CASH, positions: [], trades: [], snapshots: [{ totalAssets: STARTING_CASH, capturedAt: Date.now() }] }); setShowResetConfirm(false); };
  const confirmFirstLaunchRisk = async () => { await AsyncStorage.setItem(FIRST_LAUNCH_RISK_KEY, "confirmed"); setShowFirstLaunchRisk(false); };
  const selectMarketSource = (source: MarketSourceId) => { if (source === marketSource) return; marketSourceVersion.current += 1; quoteRequestVersion.current += 1; detailRequestVersion.current += 1; setSourceHydrated(false); setApiKey(""); setMarketSource(source); navigateTo("settings"); };
  const navItems = [["watchlist", "star-four-points-outline", "自选"], ["market", "chart-timeline-variant", "行情"], ["news", "newspaper-variant-outline", "资讯"], ["research", "flask-outline", "研究"], ["trade", "swap-horizontal-bold", "交易"], ["settings", "cog-outline", "设置"]] as [Tab, keyof typeof MaterialCommunityIcons.glyphMap, string][];
  const content = <>{activeTab === "watchlist" && <WatchlistScreen quotes={quotes} candles={candles} intraday={intraday} chartError={chartError} selected={selected} onSelect={selectQuote} onOpenResearch={() => navigateTo("research")} onRefresh={() => refreshQuotes()} onRemoveSelected={removeSelectedFromWatchlist} refreshing={refreshing} detailsLoading={detailsLoading} hasKey={hasProviderAccess} provider={provider} />}{activeTab === "market" && <MarketScreen quotes={quotes} results={searchResults} onSelect={selectQuote} onOpenDetails={openStockDetails} onAddToWatchlist={(symbol) => openStockDetails(symbol, true)} hasKey={hasProviderAccess} onSearch={searchSymbol} provider={provider} searching={searching} searchError={searchError} />}{activeTab === "news" && <NewsScreen selected={selected} research={companyResearch} onOpenResearch={openResearchFromNews} />}{activeTab === "research" && <ResearchScreen selected={selected} research={companyResearch} loading={researchLoading} error={researchError} seedQuestion={researchSeedQuestion} hasKey={hasProviderAccess} />}{activeTab === "trade" && <TradeScreen account={account} quotes={quotes} selected={selected} onOrder={paperOrder} onReset={requestResetAccount} refreshing={refreshing} onRefresh={() => refreshQuotes()} refreshStatus={portfolioQuoteRefreshStatus} lastSuccessfulRefreshAt={lastSuccessfulPortfolioQuoteRefreshAt} onOpenPositionDetails={openStockDetails} onResolvePositionQuote={resolvePositionQuote} marketRulesEnabled={marketRulesEnabled} currentMarketSource={marketSource} />}{activeTab === "settings" && <SettingsScreen marketSource={marketSource} provider={provider} hasKey={hasProviderAccess} keyMask={apiKey ? `••••${apiKey.slice(-4)}` : ""} onSaveKey={saveKey} onClearKey={clearKey} onSelectSource={selectMarketSource} onResetAccount={requestResetAccount} marketRulesEnabled={marketRulesEnabled} onToggleMarketRules={setMarketRulesEnabled} widgetOrderQuantity={widgetOrderQuantity} onWidgetOrderQuantityChange={setWidgetOrderQuantity} />}{activeTab === "about" && <AboutScreen onOpenSettings={() => navigateTo("settings")} />}</>;
		const navigation = (wide = false) => navItems.map(([tab, icon, label]) => <Pressable key={tab} testID={`navigation-${tab}`} onPress={() => navigateTo(tab)} style={({ pressed }) => [wide ? layoutStyles.wideTab : styles.tab, activeTab === tab && (wide ? layoutStyles.wideTabActive : undefined), pressed && styles.pressed]}><MaterialCommunityIcons name={icon} size={wide ? 24 : 22} color={activeTab === tab ? C.cyan : C.muted} /><Text style={[wide ? layoutStyles.wideTabLabel : styles.tabLabel, activeTab === tab && { color: C.cyan }]}>{label}</Text></Pressable>);
  // @ts-ignore 历史单行 StyleSheet 在模块初始化后注册重置确认专用样式。
  return <SafeAreaView style={styles.safe}><ScanBackground />{!storageReady ? <View style={styles.bootLayer}><GlitchMark /><Text style={styles.bootTitle}>FIN•SCOPE</Text><Text style={styles.bootCopy}>INITIALIZING LOCAL TERMINAL</Text><ActivityIndicator color={C.cyan} size="small" /></View> : null}<Animated.View style={[styles.appFade, { opacity: launchOpacity }]}><StatusBar style="light" /><Header activeTab={activeTab} onPressAbout={() => navigateTo("about")} /><View style={isWideLayout ? layoutStyles.wideFrame : styles.main}>{isWideLayout ? <View style={layoutStyles.sideRail}><Text style={layoutStyles.railCode}>MODULES</Text>{navigation(true)}<View style={layoutStyles.railFooter}><Text style={layoutStyles.railFooterText}>IOS / ANDROID</Text><Text style={layoutStyles.railFooterText}>HARMONY PATH</Text></View></View> : null}<Animated.View style={[isWideLayout ? layoutStyles.wideContent : styles.main, { opacity: pageOpacity, transform: [{ translateY: pageTranslateY }] }]}>{content}</Animated.View></View>{!isWideLayout ? <View style={styles.tabBar}>{navigation()}</View> : null}</Animated.View><Modal transparent visible={storageReady && showFirstLaunchRisk} animationType="fade" onRequestClose={() => undefined}><View style={styles.modalBackdrop}><View style={styles.firstLaunchCard}><Text style={styles.modalCode}>LOCAL ACCOUNT // NOTICE</Text><Text style={styles.modalTitle}>交易提示</Text><Text style={styles.firstLaunchText}>虚拟资金，非真实交易。任何买卖仅影响本设备的模拟账户，不会向券商、交易所或第三方下单。</Text><Pressable onPress={confirmFirstLaunchRisk} style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}><Text style={styles.confirmText}>我已知悉</Text></Pressable></View></View></Modal><Modal transparent visible={showResetConfirm} animationType="fade" onRequestClose={() => setShowResetConfirm(false)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalCode}>LOCAL ACCOUNT // RESET</Text><Text style={styles.modalTitle}>重置账户</Text><Text style={styles.modalWarning}>将清除本设备的账户余额、持仓、交易记录和资产快照，并恢复初始资金。此操作无法撤销。</Text><View style={styles.modalActions}><Pressable onPress={() => setShowResetConfirm(false)} style={styles.cancelButton}><Text style={styles.cancelText}>取消</Text></Pressable><Pressable onPress={confirmResetAccount} style={styles.dangerConfirmButton}><Text style={styles.dangerConfirmText}>确认重置</Text></Pressable></View></View></View></Modal></SafeAreaView>;
}

const orderFeedbackStyles = StyleSheet.create({
  container: { borderWidth: 1, padding: 12 },
  success: { borderColor: C.lime + "99", backgroundColor: "#80FF7012" },
  error: { borderColor: C.magenta + "99", backgroundColor: "#FF2EA612" },
  text: { fontSize: 11, lineHeight: 17, fontWeight: "700" },
});

const tradeHistoryStyles = StyleSheet.create({
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7, paddingTop: 12 },
  pageButton: { minWidth: 62, borderWidth: 1, borderColor: C.cyan + "99", paddingHorizontal: 9, paddingVertical: 8, alignItems: "center" },
  pageButtonText: { color: C.cyan, fontSize: 11, fontWeight: "800" },
  pageLabel: { flex: 1, textAlign: "center", color: C.muted, fontSize: 10 },
});

const credentialHelpStyles = StyleSheet.create({
  guidance: { gap: 10, padding: 13, backgroundColor: "#00F0FF0D", borderWidth: 1, borderColor: C.cyan + "66" },
  guidanceText: { color: C.white, fontSize: 11, lineHeight: 17 },
  linkRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  linkButton: { borderWidth: 1, borderColor: C.cyan + "99", paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { color: C.cyan, fontSize: 11, fontWeight: "800" },
});

const marketRulesStyles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, padding: 14, gap: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { color: C.white, fontSize: 13, fontWeight: "800" },
  copy: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  ruleRows: { gap: 5, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 },
  rule: { color: C.muted, fontSize: 10, lineHeight: 16 },
  positionRuleCopy: { color: C.yellow, fontSize: 9, lineHeight: 14, marginTop: 5 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ink }, scanLayer: { ...StyleSheet.absoluteFill, opacity: 0.16, backgroundColor: C.ink, borderTopWidth: 1, borderTopColor: "#ffffff0d" }, header: { height: 72, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, backgroundColor: "#08090E" }, headerBrand: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }, brandMark: { width: 22, height: 28, overflow: "hidden" }, markSlash: { position: "absolute", width: 7, height: 32, top: -2, left: 8 }, brandName: { color: C.white, letterSpacing: 1.2, fontWeight: "800", fontSize: 14 }, brandSub: { color: C.muted, fontSize: 7, letterSpacing: 1.3, marginTop: 2 }, headerCenter: { alignItems: "center" }, headerTitle: { color: C.white, fontWeight: "700", fontSize: 13 }, headerCode: { color: C.cyan, fontSize: 8, letterSpacing: 1.2, marginTop: 3 }, iconButton: { width: 38, height: 38, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.line, backgroundColor: C.panel }, main: { flex: 1 }, scrollContent: { padding: 18, paddingBottom: 34, gap: 16 }, heroLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, terminalPath: { color: C.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "700" }, tag: { borderWidth: 1, paddingVertical: 4, paddingHorizontal: 7, fontSize: 8, fontWeight: "800", letterSpacing: 1 }, connectCard: { padding: 20, gap: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderLeftWidth: 2, borderLeftColor: C.magenta }, connectTitle: { color: C.white, fontSize: 18, fontWeight: "700" }, connectCopy: { color: C.muted, fontSize: 13, lineHeight: 20 }, warningInline: { color: C.magenta, fontSize: 11, lineHeight: 17, marginTop: 4 }, featureQuote: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 4 }, featureSymbol: { color: C.white, fontSize: 27, fontWeight: "800", letterSpacing: 1 }, featureVendor: { color: C.muted, fontSize: 10, marginTop: 5 }, featurePrice: { color: C.white, fontSize: 25, fontWeight: "700" }, featureChange: { fontSize: 13, fontWeight: "700", marginTop: 4 }, chartWrap: { height: 207, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, paddingHorizontal: 4, paddingTop: 14 }, chartAxis: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 7, marginTop: 2 }, chartAxisText: { color: C.muted, fontSize: 8, letterSpacing: 1 }, rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }, caption: { color: C.muted, fontSize: 10, lineHeight: 15, flex: 1 }, microAction: { flexDirection: "row", gap: 5, alignItems: "center", padding: 8, borderWidth: 1, borderColor: C.cyan + "66" }, microActionText: { color: C.cyan, fontSize: 10, fontWeight: "700" }, sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }, sectionCode: { color: C.magenta, fontSize: 9, letterSpacing: 1.3, fontWeight: "800" }, sectionName: { color: C.white, fontSize: 17, fontWeight: "700", marginTop: 3 }, sectionAction: { color: C.muted, fontSize: 9, letterSpacing: 1 }, listPanel: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel }, quoteRow: { minHeight: 71, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.line }, quoteSelected: { backgroundColor: "#00F0FF0D", borderLeftWidth: 2, borderLeftColor: C.cyan }, quoteSymbol: { flex: 1 }, rowSymbol: { color: C.white, fontSize: 15, fontWeight: "800", letterSpacing: 0.6 }, rowMeta: { color: C.muted, fontSize: 9, marginTop: 4, letterSpacing: 0.5 }, quotePrice: { alignItems: "flex-end", minWidth: 88 }, rowPrice: { color: C.white, fontSize: 14, fontWeight: "700" }, rowChange: { fontSize: 11, marginTop: 4, fontWeight: "700" }, searchInput: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, color: C.white, paddingHorizontal: 14, minHeight: 48, fontSize: 14 }, primaryButton: { height: 48, backgroundColor: C.cyan, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, primaryButtonText: { color: C.ink, fontSize: 14, fontWeight: "800" }, marketGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, marketTile: { width: "48.4%", minHeight: 150, padding: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, justifyContent: "space-between" }, tileSymbol: { color: C.white, fontWeight: "800", fontSize: 16 }, tilePrice: { color: C.white, fontSize: 16, fontWeight: "700", marginTop: 12 }, tileChange: { fontSize: 12, fontWeight: "700", marginTop: 3 }, emptyPanel: { minHeight: 140, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, justifyContent: "center", alignItems: "center", padding: 22, gap: 8 }, emptyTitle: { color: C.white, fontSize: 15, fontWeight: "700" }, emptyCopy: { color: C.muted, fontSize: 12, textAlign: "center", lineHeight: 18 }, riskBanner: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 13, backgroundColor: "#FF2EA611", borderWidth: 1, borderColor: "#FF2EA666" }, riskText: { color: "#F4BCD9", fontSize: 12, lineHeight: 18, flex: 1 }, researchTarget: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 18 }, researchSymbol: { color: C.white, fontWeight: "800", fontSize: 26, marginTop: 9 }, researchPrice: { color: C.cyan, fontSize: 13, marginTop: 4 }, questionInput: { minHeight: 118, textAlignVertical: "top", paddingTop: 14 }, answerPanel: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, borderLeftWidth: 2, borderLeftColor: C.cyan, padding: 15, gap: 11 }, answerLabel: { color: C.cyan, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" }, answerText: { color: C.white, fontSize: 13, lineHeight: 20 }, answerSource: { color: C.muted, fontSize: 10, lineHeight: 15 }, paperNotice: { flexDirection: "row", gap: 10, padding: 13, borderWidth: 1, borderColor: C.cyan + "66", backgroundColor: "#00F0FF0B" }, paperNoticeText: { color: "#C7FBFF", fontSize: 12, lineHeight: 18, flex: 1 }, assetsCard: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, padding: 18, borderTopWidth: 2, borderTopColor: C.cyan }, assetsLabel: { color: C.muted, fontSize: 10, letterSpacing: 1.2 }, assetsValue: { color: C.white, fontSize: 32, fontWeight: "800", marginTop: 7 }, assetStats: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, marginTop: 18, paddingTop: 14, gap: 12 }, metric: { flex: 1 }, metricLabel: { color: C.muted, fontSize: 9, lineHeight: 13 }, metricValue: { color: C.white, fontSize: 12, fontWeight: "700", marginTop: 6 }, orderPanel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, padding: 15, gap: 15 }, orderSymbol: { color: C.white, fontWeight: "800", fontSize: 20 }, orderPrice: { color: C.muted, fontSize: 11, marginTop: 4 }, orderButtons: { flexDirection: "row", gap: 10 }, buyButton: { flex: 1, height: 42, justifyContent: "center", alignItems: "center", backgroundColor: C.lime }, sellButton: { flex: 1, height: 42, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.red }, buyText: { color: C.ink, fontSize: 13, fontWeight: "800" }, sellText: { color: C.red, fontSize: 13, fontWeight: "800" }, positionRow: { flexDirection: "row", justifyContent: "space-between", padding: 13, borderBottomWidth: 1, borderBottomColor: C.line }, positionInfo: { flex: 1, paddingRight: 8 }, positionActions: { flexDirection: "row", gap: 6 }, positionBuy: { borderWidth: 1, borderColor: C.lime + "99", paddingHorizontal: 9, paddingVertical: 5 }, positionSell: { borderWidth: 1, borderColor: C.red + "99", paddingHorizontal: 9, paddingVertical: 5 }, positionBuyText: { color: C.lime, fontSize: 10, fontWeight: "800" }, positionSellText: { color: C.red, fontSize: 10, fontWeight: "800" }, tradeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }, tradeSide: { fontSize: 11, fontWeight: "800", width: 37 }, tradeSymbol: { color: C.white, fontSize: 13, fontWeight: "700", width: 54 }, tradeMeta: { color: C.muted, fontSize: 11, flex: 1 }, resetButton: { height: 44, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.red + "88", marginTop: 6 }, resetText: { color: C.red, fontSize: 12, fontWeight: "800" }, modalBackdrop: { flex: 1, backgroundColor: "#000000B8", justifyContent: "flex-end" }, modalCard: { backgroundColor: C.panel2, borderTopWidth: 2, borderTopColor: C.magenta, padding: 22, gap: 13 }, firstLaunchCard: { backgroundColor: C.panel2, borderTopWidth: 2, borderTopColor: C.cyan, padding: 22, gap: 16 }, firstLaunchText: { color: C.white, fontSize: 14, lineHeight: 22 }, modalCode: { color: C.magenta, fontSize: 9, letterSpacing: 1.3, fontWeight: "800" }, modalTitle: { color: C.white, fontSize: 22, fontWeight: "800" }, modalWarning: { color: "#F4BCD9", fontSize: 12, lineHeight: 18 }, quantityInput: { color: C.white, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink, paddingHorizontal: 13, height: 48, fontSize: 16 }, modalActions: { flexDirection: "row", gap: 10 }, cancelButton: { flex: 1, height: 46, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.line }, confirmButton: { flex: 1.5, height: 46, justifyContent: "center", alignItems: "center", backgroundColor: C.cyan }, disabledButton: { opacity: 0.4 }, cancelText: { color: C.white, fontWeight: "700" }, confirmText: { color: C.ink, fontWeight: "800" }, providerCard: { flexDirection: "row", gap: 12, alignItems: "center", padding: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel }, providerBadge: { width: 42, height: 42, justifyContent: "center", alignItems: "center", backgroundColor: C.cyan }, providerBadgeText: { color: C.ink, fontWeight: "900", fontSize: 15 }, providerTitle: { color: C.white, fontSize: 16, fontWeight: "800" }, providerCopy: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, disabledProvider: { flexDirection: "row", gap: 9, padding: 13, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line }, disabledProviderText: { color: C.muted, fontSize: 11, flex: 1, lineHeight: 16 }, settingCopy: { color: C.muted, fontSize: 12, lineHeight: 18 }, keyInputWrap: { flexDirection: "row", borderWidth: 1, borderColor: C.line, backgroundColor: C.panel }, keyInput: { flex: 1, color: C.white, height: 52, paddingHorizontal: 14, fontSize: 13 }, keyToggle: { width: 50, alignItems: "center", justifyContent: "center" }, compatPanel: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, padding: 15, gap: 6 }, compatTitle: { color: C.cyan, fontSize: 11, letterSpacing: 1.1, fontWeight: "800", marginTop: 4 }, compatCopy: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 }, tabBar: { minHeight: 64, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: "#08090E", flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 10 : 7 }, tab: { alignItems: "center", gap: 3, minWidth: 48 }, tabLabel: { color: C.muted, fontSize: 9, fontWeight: "700" }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});

Object.assign(styles as Record<string, unknown>, {
  dangerConfirmButton: { flex: 1.5, height: 46, justifyContent: "center", alignItems: "center", backgroundColor: C.red },
  dangerConfirmText: { color: C.white, fontWeight: "800" },
  chartLoading: { minHeight: 230, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, justifyContent: "center", alignItems: "center", gap: 9, padding: 20 },
  chartLoadingTitle: { color: C.white, fontSize: 13, fontWeight: "800" },
  chartLoadingCopy: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: "center" },
  appFade: { flex: 1 },
  bootLayer: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: C.ink, justifyContent: "center", alignItems: "center", gap: 12 },
  bootTitle: { color: C.white, fontWeight: "900", fontSize: 22, letterSpacing: 2.4 },
  bootCopy: { color: C.cyan, fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
});

const layoutStyles = StyleSheet.create({
  wideFrame: { flex: 1, flexDirection: "row", maxWidth: 1560, width: "100%", alignSelf: "center" },
  sideRail: { width: 132, borderRightWidth: 1, borderRightColor: C.line, backgroundColor: "#08090E", paddingTop: 18, paddingHorizontal: 10 },
  railCode: { color: C.magenta, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginBottom: 14, paddingHorizontal: 9 },
  wideTab: { minHeight: 72, justifyContent: "center", alignItems: "flex-start", gap: 6, paddingHorizontal: 12, borderLeftWidth: 2, borderLeftColor: "transparent" },
  wideTabActive: { backgroundColor: "#00F0FF0B", borderLeftColor: C.cyan },
  wideTabLabel: { color: C.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  wideContent: { flex: 1, maxWidth: 1180, alignSelf: "center", width: "100%" },
  railFooter: { marginTop: "auto", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 5, paddingBottom: 14 },
  railFooterText: { color: C.muted, fontSize: 8, letterSpacing: 0.7 },
});

const watchlistStyles = StyleSheet.create({
  removeButton: { height: 38, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.red + "88", paddingHorizontal: 11, backgroundColor: "#FF4E710D" },
  removeText: { color: C.red, fontSize: 11, fontWeight: "800" },
});
