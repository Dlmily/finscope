export const CHART_LONG_PRESS_DELAY_MS = 180;
export const CHART_DRAG_CANCEL_DISTANCE_PX = 6;

/** 长按进入十字光标模式后，原生 WebView 应独占后续横向 MOVE。 */
export function shouldConsumeLockedChartMove(locked: boolean, phase: "move" | "up" | "cancel") {
  return locked && phase === "move";
}

export type LockedChartDragState = {
  locked: boolean;
  fixedScrollOffset: number;
  cursorIndex: number | null;
};

export function beginLockedChartDrag(scrollOffset: number, locationX: number, left: number, chartWidth: number, itemCount: number): LockedChartDragState {
  return {
    locked: true,
    fixedScrollOffset: Math.max(0, scrollOffset),
    cursorIndex: resolveChartCursorIndex(locationX + Math.max(0, scrollOffset), left, chartWidth, itemCount),
  };
}

export function moveLockedChartDrag(state: LockedChartDragState, locationX: number, left: number, chartWidth: number, itemCount: number): LockedChartDragState {
  if (!state.locked) return state;
  return { ...state, cursorIndex: resolveChartCursorIndex(locationX + state.fixedScrollOffset, left, chartWidth, itemCount) };
}

export function endLockedChartDrag(state: LockedChartDragState): LockedChartDragState {
  return { ...state, locked: false, cursorIndex: null };
}

export function resolveChartCursorIndex(locationX: number, left: number, chartWidth: number, itemCount: number) {
  if (!Number.isFinite(locationX) || itemCount <= 1 || chartWidth <= 0) return 0;
  const normalized = (locationX - left) / chartWidth;
  return Math.max(0, Math.min(itemCount - 1, Math.round(normalized * (itemCount - 1))));
}

export function signedChange(current: number, previous: number) {
  const value = current - previous;
  const percent = previous ? (value / previous) * 100 : 0;
  return { value, percent };
}
