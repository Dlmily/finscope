import { Text, View } from "react-native";
import { QUOTE_DETAIL_HEADER_LAYOUT, QUOTE_DETAIL_TEXT_CONSTRAINTS } from "./quoteDetailHeaderLayout";

export function QuoteDetailHeader({ title, meta, price, change, positiveColor, titleColor, mutedColor }: { title: string; meta: string; price: string; change: string; positiveColor: string; titleColor: string; mutedColor: string }) {
  return <View testID="quote-detail-header" style={QUOTE_DETAIL_HEADER_LAYOUT.container}>
    <View testID="quote-detail-info" style={QUOTE_DETAIL_HEADER_LAYOUT.info}>
      <Text testID="quote-detail-title" {...QUOTE_DETAIL_TEXT_CONSTRAINTS.title} style={{ color: titleColor, fontSize: 27, fontWeight: "800", letterSpacing: 1 }}>{title}</Text>
      <Text testID="quote-detail-meta" {...QUOTE_DETAIL_TEXT_CONSTRAINTS.meta} style={{ color: mutedColor, fontSize: 10, marginTop: 5, lineHeight: 14 }}>{meta}</Text>
    </View>
    <View testID="quote-detail-price-column" style={QUOTE_DETAIL_HEADER_LAYOUT.priceColumn}>
      <Text testID="quote-detail-price" {...QUOTE_DETAIL_TEXT_CONSTRAINTS.price} style={{ color: titleColor, fontSize: 25, fontWeight: "700" }}>{price}</Text>
      <Text testID="quote-detail-change" {...QUOTE_DETAIL_TEXT_CONSTRAINTS.change} style={{ color: positiveColor, fontSize: 13, fontWeight: "700", marginTop: 4 }}>{change}</Text>
    </View>
  </View>;
}
