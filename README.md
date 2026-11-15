# Trade Compass v1.6.6 — 006208 歷史覆蓋檢查與 009816 不配息修正

## 為什麼要修正

- 006208 **已經**存在於 v1.6.5 的 `LISTED` 名單（上市日 `2012-07-17`），不是原本被遺漏。但目前無法從本更新包證實使用者 GitHub 的 006208 歷史 JSON 是否完整，也無法排除 GitHub Pages 的發布資料缺漏。本版不虛構歷史收盤價。
- 006208 官網政策是**每年兩次收益分配**，應保留配息查詢及資料缺漏警示。
- 009816 凱基台灣 TOP50 官方明確公告「收益分配：不分配」。故現金配息事件清單為空是正常設計，**不等於 API 失敗**；基金內部收益反映在淨值／市場價格，不產生投資人的配息再投入交易。

## 你目前只需要上傳 4 個檔案

1. `scripts/update_index_etf_prices.py`：**覆蓋**原檔；優先處理 006208 的上市日至今歷史月資料，新增每檔覆蓋報告。沒有任何股價時仍產生 `006208.coverage.json` 讓你能看見失敗原因。
2. `scripts/update_index_etf_dividends.py`：**覆蓋**原檔；009816 不向配息 API 強求不存在的配息，改寫出含政策註明的 `events: []`，0050/006208 仍照原官方歷史擷取流程。
3. `.github/workflows/update-index-etf-prices.yml`：**覆蓋**原檔；先抓 006208（一般執行每次最多補 42 個缺漏月份），再處理 0050、009816。保留既有安全發布程式 `scripts/publish_index_etf_prices.py`，本 ZIP **不覆蓋**該檔。工作流程本身不修改其他 workflow。
4. `index_etf_returns.js`：**覆蓋**原檔；保留 v1.6.4 定期定額、加碼、分割、手動補價與 XIRR 計算。009816 含息模式不再因缺少配息 JSON 失效，006208 顯示後台資料覆蓋率。

> 如你在 v1.6.4 之後曾自行用 Codex 修改 `index_etf_returns.js`，請先在 GitHub 比較差異，不要直接覆蓋更新版本。

## 安裝 / 執行

在 GitHub 將四檔依照相對路徑上傳並 Commit 至 main，前往 Actions 執行 `更新指數型 ETF 官方歷史股價（自動補缺）`，建議 `full=false`，多跑數次直至 006208 缺漏月數下降。`full=true` 會嘗試重取全歷史資料，耗時且可能碰到官方節流。

**驗證 GitHub repo**：

- `data/index-etf/prices/006208.json`：`rows` 是否有 2012 年後的有效日期。
- `data/index-etf/prices/006208.coverage.json`：`rows`、`earliestSaved`、`latestSaved`、`missingMonthCount`、`failedRequests`。
- `data/index-etf/dividends/009816.json`：`distributionPolicy: none`、`events: []`（合法的零配息政策）。

**驗證 GitHub Pages**：

- `https://tony71015-sudo.github.io/stock-tracker/data/index-etf/prices/006208.json`
- `https://tony71015-sudo.github.io/stock-tracker/data/index-etf/prices/006208.coverage.json`
- `https://tony71015-sudo.github.io/stock-tracker/index_etf_returns.js`

若 repo 有資料但 Pages 是 404 或仍是舊資料，問題在網站**發布流程**：需確保 `_site/` 複製 `index_etf_returns.js`、`data/index-etf/prices/`、`data/index-etf/dividends/`。本補丁為降低風險，**沒有**再次自動修改三大法人或 GitHub Pages 發布的 workflow。

## 使用風險

歷史價格是未還原收盤價；ETF 分割及配息需由回測模組分開處理。006208 的缺漏月份報告只表示某個月份是否至少有一筆股價，**不是每日完整度保證**。缺值不會以前一日行情補造。009816 無現金配息不等於沒有底層股利收入，也不等於網站能準確預測報酬。ETF 基金政策若未來改變須更新本規則。投資前需與官方資訊交叉核對。

資料來源：
- 凱基 009816 官方基金資料：https://www.kgifund.com.tw/Fund/Detail?fundID=J023
- 富邦 006208 官方基金資料：https://websys.fsit.com.tw/FubonETF/Fund/Profile.aspx?stkId=006208
- 證交所個股日成交資訊：https://accessibility.twse.com.tw/zh/trading/historical/stock-day.html
