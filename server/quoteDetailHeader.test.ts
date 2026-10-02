import { describe, expect, it } from "vitest";
import { QUOTE_DETAIL_HEADER_LAYOUT, QUOTE_DETAIL_TEXT_CONSTRAINTS } from "../mobile/src/components/quoteDetailHeaderLayout";

describe("QuoteDetailHeader narrow-screen layout", () => {
  it("keeps title text shrinkable and price content within a bounded, shrinkable column", () => {
    expect(QUOTE_DETAIL_HEADER_LAYOUT.container).toMatchObject({ flexDirection: "row", minWidth: 0 });
    expect(QUOTE_DETAIL_HEADER_LAYOUT.info).toMatchObject({ flex: 1, minWidth: 0, paddingRight: 8 });
    expect(QUOTE_DETAIL_HEADER_LAYOUT.priceColumn).toMatchObject({ width: "42%", maxWidth: 150, minWidth: 0, flexShrink: 1 });
    expect(QUOTE_DETAIL_TEXT_CONSTRAINTS.title).toEqual({ numberOfLines: 1, ellipsizeMode: "tail" });
    expect(QUOTE_DETAIL_TEXT_CONSTRAINTS.price).toEqual({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 });
  });
});
