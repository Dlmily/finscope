# Finnhub 图表能力核查

## 官方文档结论

Finnhub 的 REST API 使用 `/api/v1` 基础路径，GET 请求须以 `token` 参数或 `X-Finnhub-Token` 传递个人 API Key；超过套餐限额会返回 HTTP `429`。[1]

官方 API 文档将股票 OHLCV Candle 标记为 **Premium**；其定价页列出了美国股票的日线与 1 分钟 OHLC 历史能力，并明确国际市场的日线与分钟级覆盖取决于市场和套餐，除已列明市场外，其他国际市场只提供日终数据。[1] [2] 这意味着现有 App 不能把任何 Finnhub Key 都视为天然具备分时或K线授权。

股票 Candle 的 `symbol` 必须使用 Finnhub 代码体系，即由 `/search` 或 `/stock/symbol` 返回并可直接用于 `/stock/candle` 的 `symbol` 字段；国内应用内部使用的 `600519.SH`、`000001.SH` 等代码不能直接假定可在 Finnhub Candle 接口使用。[1]

## 当前 App 修复策略

| 场景 | 处理策略 |
| --- | --- |
| 已获支持的 Finnhub 美股代码（例如 `AAPL`）且套餐授权 Candle | 使用 `/stock/candle?symbol=…&resolution=D&from=…&to=…` 获取日K。 |
| 支持分钟 Candle 的套餐与标的 | 仅在请求成功且 `s = "ok"` 时使用分钟分辨率；失败时明确提示权限、限流、休市或市场覆盖问题。 |
| 国内代码或未覆盖市场 | 不向 Finnhub 假定请求分时；显示该数据源未覆盖当前标的的图表数据。 |
| API 返回 `no_data`、非 `ok` 或 HTTP 401/403/429 | 保留错误原因并在图表区域展示，不将错误伪装为静默空白。 |

## 参考资料

[1] [Finnhub 官方 API Documentation：Stock Candles、认证与 Symbols](https://finnhub.io/docs/api/stock-candles)。

[2] [Finnhub 官方 Market Data Pricing](https://finnhub.io/pricing-stock-api-market-data)。
