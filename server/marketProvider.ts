export const marketSourceIds = ["FINNHUB"] as const;

export type MarketSourceId = (typeof marketSourceIds)[number];

export type MarketSourceDescriptor = {
  id: MarketSourceId;
  label: string;
  status: "ACTIVE" | "PENDING_AUTHORIZED_CONTRACT";
  supports: readonly ("QUOTE" | "CHART" | "SEARCH" | "COMPANY" | "NEWS")[];
  credentialMode: "SERVER_DEFAULT_OR_DEVICE_KEY";
  disclosure: string;
};

const registeredSources: Record<MarketSourceId, MarketSourceDescriptor> = {
  FINNHUB: {
    id: "FINNHUB",
    label: "Finnhub",
    status: "ACTIVE",
    supports: ["QUOTE", "CHART", "SEARCH", "COMPANY", "NEWS"],
    credentialMode: "SERVER_DEFAULT_OR_DEVICE_KEY",
    disclosure: "行情与企业公开资料由 Finnhub 提供；可使用服务器默认密钥或用户设备安全存储中的个人密钥。",
  },
};

export function listMarketSources(): MarketSourceDescriptor[] {
  return marketSourceIds.map((id) => registeredSources[id]);
}

export function resolveMarketSource(value?: string): MarketSourceId {
  if (!value) return "FINNHUB";
  const normalized = value.trim().toUpperCase();
  if (normalized === "FINNHUB") return "FINNHUB";
  throw new Error(`Unsupported market data source: ${value}`);
}

export function getMarketSource(value?: string): MarketSourceDescriptor {
  return registeredSources[resolveMarketSource(value)];
}
