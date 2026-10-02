import { StyleSheet } from "react-native";

export const domesticStyles = StyleSheet.create({
  marketScopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  providerSelected: { borderColor: "#00F0FF", borderLeftWidth: 2 },
  marketFacts: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: "#292B36", backgroundColor: "#0D0E13" },
  marketFact: { width: "25%", minHeight: 58, paddingHorizontal: 10, paddingVertical: 9, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#292B36" },
  marketFactLabel: { color: "#8B91A2", fontSize: 9, letterSpacing: 0.4 },
  marketFactValue: { color: "#F5F7FB", fontSize: 12, fontWeight: "800", marginTop: 5 },
});
