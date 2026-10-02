# 行情数据源字段与权限矩阵

> 本矩阵基于 2026-08-27 可访问的供应商公开文档。只有文档明确列出的字段才应在应用中标示为已覆盖；未文档化或权限不足时，界面必须显示“未覆盖”而不能填充推测值。

| 数据源 | 文档化的当前用途 | 已确认字段/能力 | 限制与 App 处理 |
| --- | --- | --- | --- |
| 腾讯公开行情测试通道 | 未找到面向第三方开发者的公开 API 文档；当前仅验证了公开响应中的报价、前复权日线和部分标的分钟数据。 | 当前测试响应含 OHLC、成交量、前复权日线，以及形如 `HHmm price volume amount` 的当日分钟采样。 | 仅用于内测的公开延时行情体验，不承诺 SLA、商业展示许可、分钟线持续可用性、基本面或资讯。App 只在返回有效分钟点时绘制分时；否则明确显示无分时数据状态。 |
| Tushare Pro `daily` | 官方 A 股日线文档。 | `open`、`high`、`low`、`close`、`pre_close`、`change`、`pct_chg`、`vol`、`amount`。日线为未复权，交易日约 15:00–16:00 入库。 | 需要用户 Token；港股/指数、分钟和权限由各接口及积分决定。App 仅请求并展示当前 Token 可取得的字段。 |
| Tushare Pro `pro_bar` | 官方通用行情接口文档。 | 日/周/月 K，分钟频度，日线前/后复权、MA 与成交量相关计算。 | 文档明确说明该集成接口目前不能直接通过 HTTP 调用；当前设备本地 REST provider 不声称使用 `pro_bar`，只由 App 对真实日线聚合出周/月及 MA。 |
| Finnhub | 官方 API 文档。 | 需要 Token；`/stock/candle` 支持 `1`、`5`、`15`、`30`、`60`、`D`、`W`、`M` 分辨率，且必须使用 `/search` 或 `/stock/symbol` 返回的 Finnhub `symbol`；文档将 Candles（OHLCV）列为 Premium。 | App 对已覆盖且获授权的 Finnhub 标的请求 `resolution=1` 分时和 `resolution=D` 日线。API 返回 `no_data`、401/403/429 或非 `ok` 时会显示套餐、覆盖、休市或限流原因，不能静默回退为空图。 |

## 实施规则

1. K 线蜡烛、成交量和均线只依据 provider 返回的 OHLCV 与收盘价计算。
2. 周K与月K由已加载的真实日线聚合，不伪造未取到的原始周/月线。
3. “前复权”仅在当前腾讯 `qfqday` 响应被使用时显示；Tushare `daily` 显示“未复权”；其他源显示“供应商口径”。
4. 腾讯分钟响应的字段解释仅限实测形状，不能视为正式 API 契约；分钟数据缺失、延迟或变更时，App 必须显示无数据状态。
5. 国内基本面、新闻与实时行情不得因 UI 需要而填充；应等待相应的授权数据源或用户 Token 权限。
6. 腾讯证券网页可公开浏览不等于存在第三方资讯 API 授权。未提供正式授权包前，默认腾讯公开行情测试源不展示或复用其个股资讯；核查过程见 [`tencent-news-api-review.md`](./tencent-news-api-review.md)。
7. Finnhub 分时和日线只对其定义的 `symbol`、相应市场与实际套餐权限可用；不能把国内代码直接视为 Finnhub Candle 标的，也不能将返回 `no_data` 误写为价格为零。

## 参考资料

1. [Tushare A股日线行情 `daily`](https://tushare.pro/document/2?doc_id=27)。
2. [Tushare 通用行情接口 `pro_bar`](https://tushare.pro/document/2?doc_id=109)。
3. [Finnhub API Documentation](https://finnhub.io/docs/api/stock-candles)。
4. [Finnhub Company News Documentation](https://finnhub.io/docs/api/company-news)。
5. [Finnhub Market Data Pricing](https://finnhub.io/pricing-stock-api-market-data)。
