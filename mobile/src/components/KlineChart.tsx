import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, type GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import type { MarketCandle, MarketCurrency, MarketIntradayPoint } from "../services/marketProvider";
import { aggregateCandles, type KlineInterval, movingAverage } from "../services/marketChart";
import { beginLockedChartDrag, CHART_DRAG_CANCEL_DISTANCE_PX, CHART_LONG_PRESS_DELAY_MS, endLockedChartDrag, moveLockedChartDrag, resolveChartCursorIndex, signedChange, type LockedChartDragState } from "../services/marketChartInteraction";

const C = { panel: "#0D0E13", white: "#F5F7FB", muted: "#8B91A2", cyan: "#00F0FF", red: "#FF4E71", lime: "#80FF70", yellow: "#F6B93B", orange: "#E36A3A", blue: "#6E8CFF", line: "#292B36", grid: "#1A1B24" };
type ChartMode = "INTRADAY" | KlineInterval;
const labels: Record<ChartMode, string> = { INTRADAY: "分时", DAY: "日K", WEEK: "周K", MONTH: "月K" };

function price(value: number, currency: MarketCurrency) { return `${currency === "HKD" ? "HK$" : currency === "USD" ? "$" : "¥"}${value.toFixed(value < 10 ? 3 : 2)}`; }
function volume(value?: number) { if (!Number.isFinite(value)) return "—"; if ((value ?? 0) >= 1e8) return `${((value ?? 0) / 1e8).toFixed(2)}亿`; if ((value ?? 0) >= 1e4) return `${((value ?? 0) / 1e4).toFixed(2)}万`; return Math.round(value ?? 0).toLocaleString(); }
function timestamp(value?: number) { if (!value) return "—"; return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value * 1000)).replace(/\//g, "-"); }
function dateLabel(value: number, interval: KlineInterval) { const date = new Date(value * 1000); return interval === "MONTH" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : `${date.getMonth() + 1}/${date.getDate()}`; }
function minuteLabel(value: string) { return /^\d{4}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2)}` : value; }

function useLongPressCursor(count: number, left: number, drawWidth: number, svgHeight: number) {
  const ref = useRef<ScrollView>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const offset = useRef(0); const lockedOffset = useRef(0); const startX = useRef(0); const lockedRef = useRef(false); const lockedDrag = useRef<LockedChartDragState | null>(null); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyNativeLock = useCallback((nextLocked: boolean) => {
    if (typeof window === "undefined") return;
    const bridge = (window as Window & { FinscopeNativeBridge?: { setChartCursorLocked?: (locked: boolean) => void } }).FinscopeNativeBridge;
    bridge?.setChartCursorLocked?.(nextLocked);
  }, []);
  const setCursorLock = useCallback((nextLocked: boolean) => {
    lockedRef.current = nextLocked;
    setLocked(nextLocked);
    notifyNativeLock(nextLocked);
  }, [notifyNativeLock]);
  const clearTimer = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);
  const select = useCallback((x: number) => setCursor(resolveChartCursorIndex(x + offset.current, left, drawWidth, count)), [count, drawWidth, left]);
  const release = useCallback(() => { clearTimer(); if (lockedDrag.current) lockedDrag.current = endLockedChartDrag(lockedDrag.current); setCursorLock(false); setCursor(null); }, [clearTimer, setCursorLock]);
  const begin = useCallback((event: GestureResponderEvent) => { startX.current = event.nativeEvent.locationX; clearTimer(); lockedDrag.current = null; setCursorLock(false); timer.current = setTimeout(() => { const state = beginLockedChartDrag(offset.current, startX.current, left, drawWidth, count); lockedDrag.current = state; lockedOffset.current = state.fixedScrollOffset; setCursorLock(true); setCursor(state.cursorIndex); }, CHART_LONG_PRESS_DELAY_MS); }, [clearTimer, count, drawWidth, left, setCursorLock]);
  const move = useCallback((event: GestureResponderEvent) => { const x = event.nativeEvent.locationX; if (!lockedRef.current && Math.abs(x - startX.current) > CHART_DRAG_CANCEL_DISTANCE_PX) { clearTimer(); return; } if (lockedRef.current && lockedDrag.current) { event.preventDefault?.(); lockedDrag.current = moveLockedChartDrag(lockedDrag.current, x, left, drawWidth, count); ref.current?.scrollTo({ x: lockedDrag.current.fixedScrollOffset, animated: false }); setCursor(lockedDrag.current.cursorIndex); } }, [clearTimer, count, drawWidth, left, ref]);
  useEffect(() => () => { clearTimer(); notifyNativeLock(false); }, [clearTimer, notifyNativeLock]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const onNativeTouch = (event: Event) => {
      const detail = (event as CustomEvent<{ phase?: string; x?: number; y?: number }>).detail;
      if (!detail || typeof detail.x !== "number" || typeof detail.y !== "number") return;
      const target = document.elementFromPoint(detail.x, detail.y)?.closest?.("svg");
      if (!target || Number(target.getAttribute("height")) !== svgHeight) { if (detail.phase === "up" || detail.phase === "cancel") release(); return; }
      const rect = target.getBoundingClientRect();
      // Native screen coordinates are relative to the rendered SVG; convert them back to
      // the visible ScrollView viewport before the lock state reapplies its fixed offset.
      const synthetic = { nativeEvent: { locationX: detail.x - rect.left - offset.current }, preventDefault: () => undefined } as GestureResponderEvent;
      if (detail.phase === "down") begin(synthetic); else if (detail.phase === "move") move(synthetic); else release();
    };
    window.addEventListener("finscopeNativeChartTouch", onNativeTouch);
    return () => window.removeEventListener("finscopeNativeChartTouch", onNativeTouch);
  }, [begin, move, release, svgHeight]);
  return { ref, cursor, locked, release, handlers: { onScroll: (event: { nativeEvent: { contentOffset: { x: number } } }) => { const nextOffset = event.nativeEvent.contentOffset.x; offset.current = nextOffset; if (lockedRef.current && Math.abs(nextOffset - lockedOffset.current) > 1) ref.current?.scrollTo({ x: lockedOffset.current, animated: false }); }, scrollEventThrottle: 16, onTouchStart: begin, onTouchMove: move, onTouchEnd: release, onTouchCancel: release } };
}

function Crosshair({ x, y, right, top, bottom }: { x: number; y: number; right: number; top: number; bottom: number }) {
  return <G pointerEvents="none"><Line x1={x} x2={x} y1={top} y2={bottom} stroke={C.cyan} strokeWidth="1" strokeDasharray="3 3" /><Line x1={40} x2={right} y1={y} y2={y} stroke={C.cyan} strokeWidth="1" strokeDasharray="3 3" /><Circle cx={x} cy={y} r={3.5} fill={C.panel} stroke={C.cyan} strokeWidth="1.5" /></G>;
}

function Caption({ quoteTimestamp }: { quoteTimestamp?: number }) { return <Text style={styles.caption}>报价更新时间：{timestamp(quoteTimestamp)} · 长按后拖动查看具体时间点</Text>; }

function Intraday({ data, currency, quoteTimestamp, errorMessage }: { data: MarketIntradayPoint[]; currency: MarketCurrency; quoteTimestamp?: number; errorMessage?: string | null }) {
  const w = Math.max(620, data.length * 6 + 58), left = 40, right = 10, drawW = w - left - right, top = 22, h = 132, volumeTop = 186, volumeH = 42;
  const gesture = useLongPressCursor(data.length, left, drawW, 260);
  useEffect(() => { gesture.release(); const id = setTimeout(() => gesture.ref.current?.scrollToEnd({ animated: false }), 0); return () => clearTimeout(id); }, [data.length, gesture.release, gesture.ref]);
  if (!data.length) return <Empty title="暂无可绘制的分时数据" copy={errorMessage ?? "当前标的或数据源未返回今日有效分时；可切换至日K查看已加载日线。"} />;
  const values = data.map((p) => p.price), low = Math.min(...values), high = Math.max(...values), span = Math.max(high - low, high * 0.004), maxVol = Math.max(0, ...data.map((p) => p.volume ?? 0));
  const x = (i: number) => left + (data.length <= 1 ? drawW / 2 : i * drawW / (data.length - 1)); const y = (v: number) => top + h - (v - low) / span * h;
  const selected = gesture.cursor === null ? null : data[gesture.cursor]; const prev = selected ? data[Math.max(0, gesture.cursor! - 1)].price : 0;
  return <View style={styles.chart}><Text style={styles.meta}>今日分时 · {data.length} 个采样点 · {gesture.locked ? "十字光标已锁定" : "长按后拖动查看"}</Text><ScrollView ref={gesture.ref} horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scroll} onContentSizeChange={() => gesture.ref.current?.scrollToEnd({ animated: false })} {...gesture.handlers}><Svg width={w} height={260}><Polyline points={data.map((p, i) => `${x(i)},${y(p.price)}`).join(" ")} fill="none" stroke={data[data.length - 1].price >= data[0].price ? C.red : C.lime} strokeWidth="1.8" />{[0, .25, .5, .75, 1].map((r) => <Line key={r} x1={left} x2={w - right} y1={top + h * r} y2={top + h * r} stroke={C.grid} />)}{data.map((p, i) => { const bar = maxVol ? Math.max(1, (p.volume ?? 0) / maxVol * volumeH) : 0; return bar ? <Rect key={p.timestamp} x={x(i) - 2} y={volumeTop + volumeH - bar} width={4} height={bar} fill={i && p.price < data[i - 1].price ? C.lime : C.red} /> : null; })}{[0, Math.floor(data.length / 2), data.length - 1].map((i) => <SvgText key={i} x={x(i)} y={246} textAnchor="middle" fill={C.muted} fontSize="9">{data[i].label}</SvgText>)}{selected ? <Crosshair x={x(gesture.cursor!)} y={y(selected.price)} right={w - right} top={top} bottom={volumeTop + volumeH} /> : null}</Svg></ScrollView>{selected ? <CursorPanel title="分时时点" time={`${timestamp(selected.timestamp)} · ${minuteLabel(selected.label)}`} rows={[`价 ${price(selected.price, currency)}`, `较前 ${signedChange(selected.price, prev).value.toFixed(2)}`, `量 ${volume(selected.volume)} · 额 ${volume(selected.amount)}`]} /> : null}<Caption quoteTimestamp={quoteTimestamp} /></View>;
}

function Empty({ title, copy }: { title: string; copy: string }) { return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyCopy}>{copy}</Text></View>; }
function CursorPanel({ title, time, rows }: { title: string; time: string; rows: string[] }) { return <View style={styles.cursor}><Text style={styles.cursorTitle}>{title}</Text><Text style={styles.cursorTime}>{time}</Text>{rows.map((row) => <Text key={row} style={styles.cursorRow}>{row}</Text>)}</View>; }

function Candles({ data, interval, currency, quoteTimestamp, errorMessage }: { data: MarketCandle[]; interval: KlineInterval; currency: MarketCurrency; quoteTimestamp?: number; errorMessage?: string | null }) {
  const w = Math.max(560, data.length * 22 + 58), left = 42, right = 12, drawW = w - left - right, top = 38, h = 160, volTop = 235, volH = 52;
  const gesture = useLongPressCursor(data.length, left, drawW, 326);
  const ma5 = useMemo(() => movingAverage(data, 5), [data]);
  const ma10 = useMemo(() => movingAverage(data, 10), [data]);
  const ma20 = useMemo(() => movingAverage(data, 20), [data]);
  useEffect(() => { gesture.release(); const id = setTimeout(() => gesture.ref.current?.scrollToEnd({ animated: false }), 0); return () => clearTimeout(id); }, [data.length, gesture.release, gesture.ref]);
  if (!data.length) return <Empty title="暂无可绘制的 K 线数据" copy={errorMessage ?? "数据源没有返回有效 OHLC 日线；请刷新或切换已覆盖的标的。"} />;
  const low = Math.min(...data.map((d) => d.low)), high = Math.max(...data.map((d) => d.high)), span = Math.max(high - low, high * .02), maxVol = Math.max(0, ...data.map((d) => d.volume ?? 0));
  const x = (i: number) => left + (data.length <= 1 ? drawW / 2 : i * drawW / (data.length - 1));
  const y = (v: number) => top + h - (v - low) / span * h;
  const maPoints = (series: Array<number | null>) => series.map((value, i) => value === null ? null : `${x(i)},${y(value)}`).filter((value): value is string => Boolean(value)).join(" ");
  const bodyW = Math.max(4, Math.min(12, drawW / data.length - 3)); const selected = gesture.cursor === null ? null : data[gesture.cursor];
  return <View><View style={styles.ma}><Text style={{ color: C.muted, fontSize: 10 }}>均线</Text><Text style={{ color: C.yellow, fontSize: 10 }}>MA5 {ma5.at(-1)?.toFixed(2) ?? "—"}</Text><Text style={{ color: C.orange, fontSize: 10 }}>MA10 {ma10.at(-1)?.toFixed(2) ?? "—"}</Text><Text style={{ color: C.blue, fontSize: 10 }}>MA20 {ma20.at(-1)?.toFixed(2) ?? "—"}</Text></View><ScrollView ref={gesture.ref} horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scroll} onContentSizeChange={() => gesture.ref.current?.scrollToEnd({ animated: false })} {...gesture.handlers}><Svg width={w} height={326}>{[0,.25,.5,.75,1].map((r) => <Line key={r} x1={left} x2={w-right} y1={top+h*r} y2={top+h*r} stroke={C.grid} />)}{maPoints(ma5) ? <Polyline points={maPoints(ma5)} fill="none" stroke={C.yellow} strokeWidth="1.4" /> : null}{maPoints(ma10) ? <Polyline points={maPoints(ma10)} fill="none" stroke={C.orange} strokeWidth="1.4" /> : null}{maPoints(ma20) ? <Polyline points={maPoints(ma20)} fill="none" stroke={C.blue} strokeWidth="1.4" /> : null}{data.map((d,i) => { const up=d.close>=d.open, color=up?C.red:C.lime, bodyTop=Math.min(y(d.open),y(d.close)), bodyH=Math.max(1.5,Math.abs(y(d.open)-y(d.close))), bar=maxVol?Math.max(1,(d.volume??0)/maxVol*volH):0; return <G key={d.timestamp}><Line x1={x(i)} x2={x(i)} y1={y(d.high)} y2={y(d.low)} stroke={color}/><Rect x={x(i)-bodyW/2} y={bodyTop} width={bodyW} height={bodyH} fill={color}/>{bar ? <Rect x={x(i)-bodyW/2} y={volTop+volH-bar} width={bodyW} height={bar} fill={color}/> : null}{(i % Math.max(1,Math.floor(data.length/4))===0 || i===data.length-1) ? <SvgText x={x(i)} y={307} textAnchor="middle" fill={C.muted} fontSize="9">{dateLabel(d.timestamp,interval)}</SvgText> : null}</G>; })}{selected ? <Crosshair x={x(gesture.cursor!)} y={y(selected.close)} right={w-right} top={top} bottom={volTop+volH} /> : null}</Svg></ScrollView>{selected ? <CursorPanel title={`${labels[interval]} · 交易时点`} time={timestamp(selected.timestamp)} rows={[`开 ${price(selected.open,currency)} · 高 ${price(selected.high,currency)}`, `低 ${price(selected.low,currency)} · 收 ${price(selected.close,currency)}`, `量 ${volume(selected.volume)}`]} /> : null}<Caption quoteTimestamp={quoteTimestamp} /></View>;
}

export function KlineChart({ candles, intraday, currency, adjustmentLabel, quoteTimestamp, errorMessage }: { candles: MarketCandle[]; intraday: MarketIntradayPoint[]; currency: MarketCurrency; adjustmentLabel: string; quoteTimestamp?: number; errorMessage?: string | null }) {
  const [mode, setMode] = useState<ChartMode>("INTRADAY"); const interval = mode === "INTRADAY" ? "DAY" : mode; const data = useMemo(() => aggregateCandles(candles, interval), [candles, interval]);
  return <View style={styles.wrap}><View style={styles.toolbar}><View style={styles.tabs}>{(["INTRADAY","DAY","WEEK","MONTH"] as ChartMode[]).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.tab, mode===item && styles.active]}><Text style={[styles.tabText, mode===item && {color:C.white}]}>{labels[item]}</Text></Pressable>)}</View><Pressable onPress={() => Alert.alert("图表手势", "普通横向滑动浏览时间轴。静止按住图表约 0.18 秒后，时间轴将锁定；继续拖动只移动十字光标。松手后恢复横向滚动。")}><Text style={styles.more}>{mode === "INTRADAY" ? "今日 · 更多 ▾" : `${adjustmentLabel} · 更多 ▾`}</Text></Pressable></View>{mode === "INTRADAY" ? <Intraday data={intraday} currency={currency} quoteTimestamp={quoteTimestamp} errorMessage={errorMessage} /> : <Candles data={data} interval={interval} currency={currency} quoteTimestamp={quoteTimestamp} errorMessage={errorMessage} />}</View>;
}

const styles = StyleSheet.create({ wrap:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line,paddingTop:8}, toolbar:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:12}, tabs:{flexDirection:"row",gap:13}, tab:{paddingVertical:8,borderBottomWidth:3,borderBottomColor:"transparent"}, active:{borderBottomColor:C.cyan}, tabText:{color:C.muted,fontSize:12,fontWeight:"700"}, more:{color:C.muted,fontSize:11,fontWeight:"700",padding:8}, chart:{paddingTop:5}, meta:{color:C.muted,fontSize:10,paddingHorizontal:12,paddingBottom:4}, scroll:{paddingBottom:2}, caption:{color:C.muted,borderTopWidth:1,borderTopColor:C.grid,fontSize:9,lineHeight:14,paddingHorizontal:12,paddingTop:8,paddingBottom:11}, cursor:{borderTopWidth:1,borderTopColor:C.cyan+"66",backgroundColor:"#00F0FF0A",paddingHorizontal:12,paddingVertical:9,gap:3}, cursorTitle:{color:C.cyan,fontSize:9,fontWeight:"800"}, cursorTime:{color:C.white,fontSize:11,fontWeight:"700"}, cursorRow:{color:C.muted,fontSize:10}, empty:{minHeight:180,backgroundColor:C.panel,borderWidth:1,borderColor:C.line,justifyContent:"center",alignItems:"center",padding:20,gap:7}, emptyTitle:{color:C.white,fontWeight:"700"}, emptyCopy:{color:C.muted,fontSize:11,textAlign:"center",lineHeight:16}, ma:{flexDirection:"row",gap:10,paddingHorizontal:12,paddingBottom:3} });
