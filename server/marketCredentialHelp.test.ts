import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "../mobile/App";
import { getDeviceMarketProvider } from "../mobile/src/services/marketProvider";

describe("credential registration guidance", () => {
  const renderSettings = (source: "TUSHARE" | "FINNHUB") => {
    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(React.createElement(SettingsScreen, {
        marketSource: source, provider: getDeviceMarketProvider(source), hasKey: false, keyMask: "",
        onSaveKey: async () => undefined, onClearKey: () => undefined, onSelectSource: () => undefined, onResetAccount: () => undefined,
      }));
    });
    return rendered!;
  };

  it("shows Finnhub official registration and API-key guidance when no key is stored", () => {
    const root = renderSettings("FINNHUB").root;
    expect(root.findByProps({ testID: "credential-registration-guidance" })).toBeTruthy();
    expect(root.findByProps({ testID: "credential-register-link" }).findByType("Text").props.children).toBe("注册 Finnhub");
    expect(getDeviceMarketProvider("FINNHUB").credentialHelp).toMatchObject({ registrationUrl: "https://finnhub.io/register", credentialGuideUrl: "https://finnhub.io/docs/api/authentication" });
  });

  it("shows Tushare Pro official registration and token guidance when no token is stored", () => {
    const root = renderSettings("TUSHARE").root;
    expect(root.findByProps({ testID: "credential-register-link" }).findByType("Text").props.children).toBe("注册 Tushare Pro");
    expect(getDeviceMarketProvider("TUSHARE").credentialHelp).toMatchObject({ registrationUrl: "https://tushare.pro/weborder/", credentialGuideUrl: "https://tushare.pro/document/1?doc_id=39" });
  });

  it("enables A-share, US and HK market rules by default and passes an explicit off choice to the parent", () => {
    const onToggleMarketRules = vi.fn();
    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(React.createElement(SettingsScreen, {
        marketSource: "TENCENT", provider: getDeviceMarketProvider("TENCENT"), hasKey: true, keyMask: "",
        onSaveKey: async () => undefined, onClearKey: () => undefined, onSelectSource: () => undefined, onResetAccount: () => undefined, onToggleMarketRules,
      }));
    });
    const toggle = rendered!.root.findAllByProps({ testID: "market-rules-toggle" }).find((node) => typeof node.props.onValueChange === "function");
    expect(toggle?.props.value).toBe(true);
    act(() => { toggle?.props.onValueChange(false); });
    expect(onToggleMarketRules).toHaveBeenCalledWith(false);
  });

  it("uses one share by default for widget orders and commits a user-selected positive integer", () => {
    const onWidgetOrderQuantityChange = vi.fn();
    let rendered: ReturnType<typeof create>;
    act(() => {
      rendered = create(React.createElement(SettingsScreen, {
        marketSource: "TENCENT", provider: getDeviceMarketProvider("TENCENT"), hasKey: true, keyMask: "",
        onSaveKey: async () => undefined, onClearKey: () => undefined, onSelectSource: () => undefined, onResetAccount: () => undefined, onWidgetOrderQuantityChange,
      }));
    });
    const input = rendered!.root.findByProps({ testID: "widget-default-quantity-input" });
    expect(input.props.value).toBe("1");
    act(() => { input.props.onChangeText("5"); });
    act(() => { rendered!.root.findByProps({ testID: "widget-default-quantity-input" }).props.onBlur(); });
    expect(onWidgetOrderQuantityChange).toHaveBeenCalledWith(5);
  });
});
