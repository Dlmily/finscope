export const QUOTE_DETAIL_HEADER_LAYOUT = {
  container: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "flex-end" as const, paddingTop: 4, minWidth: 0 },
  info: { flex: 1, minWidth: 0, paddingRight: 8 },
  priceColumn: { width: "42%", maxWidth: 150, minWidth: 0, flexShrink: 1, alignItems: "flex-end" as const },
} as const;

export const QUOTE_DETAIL_TEXT_CONSTRAINTS = {
  title: { numberOfLines: 1, ellipsizeMode: "tail" as const },
  meta: { numberOfLines: 2, ellipsizeMode: "tail" as const },
  price: { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 },
  change: { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75 },
} as const;
