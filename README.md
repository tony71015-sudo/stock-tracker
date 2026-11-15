# Trade Compass v1.6.5 — Official ETF historical prices automatic backfill

## Purpose

This update replaces the existing `update-index-etf-prices.yml` workflow and price script. It retains the v1.6.4 frontend `index_etf_returns.js` and the exact `rows` schema consumed by that frontend. It does not change active ETF holdings, three-institution flows, index ETF portfolio constituents, or website layout.

### Official data availability

| Ticker | Listed | TWSE STOCK_DAY supported query start |
|---|---|---|
| 0050 | 2003-06-30 | 2010-01-04 (2003–2009 not returned by this endpoint) |
| 006208 | 2012-07-17 | Listing date |
| 009816 | 2026-02-03 | Listing date |

**Critical:** This does NOT automatically reconstruct 0050 2003–2009. Those years require another traceable official source. The tool does not invent prices or use forward filling. Daily prices are original, unadjusted closing prices; dividends and splits are applied by the return calculation module, not pre-adjusted here.

## Files to upload (maintain same GitHub paths)

1. `scripts/update_index_etf_prices.py` — overwrite
2. `scripts/update_index_etf_dividends.py` — overwrite or retain if identical (included for a complete package)
3. `scripts/publish_index_etf_prices.py` — new
4. `.github/workflows/update-index-etf-prices.yml` — overwrite

Do NOT upload `__pycache__`. Do NOT run the workflow that modifies workflow YAML files; edit/upload workflow directly from the GitHub UI and commit.

## How to run

In GitHub Actions choose **更新指數型 ETF 官方歷史股價（自動補缺）** and **Run workflow**. Start with `full=false` so that each run attempts 18 missing months for each ETF and refreshes recent months. It is safe to run repeatedly; historical JSON is merged by date. If you want all available months at once, use `full=true` (large number of requests; API may throttle, and partial download is possible). Weekday scheduled runs continue filling gaps automatically.

Inspect `data/index-etf/prices/0050.json`, `006208.json`, `009816.json`, and companion `*.coverage.json` for latest saved date, data ranges and warnings.

### Website deployment

Updating repository data is different from updating the GitHub Pages artifact. Your *existing* publication workflow must include `data/index-etf/prices/` and `data/index-etf/dividends/` in `_site/data/index-etf/`. This patch deliberately does not change publishing workflows because earlier automation edits caused GitHub permissions and Git merge failures. Verify the real published file URL, e.g. `https://tony71015-sudo.github.io/stock-tracker/data/index-etf/prices/0050.json`. If that returns 404 or remains stale, repair the existing Pages publishing workflow separately.

### Safety and interpretation

Official prices can be missing because of market holidays, suspensions, API unavailability or pre-2010 limitations. The data are **unadjusted** close prices. Corporate action split effects must be handled by return simulation; dividend history is a separate dataset. No price interpolation, no invented records. Financial values are for research and need validation against brokerage and issuer records.
