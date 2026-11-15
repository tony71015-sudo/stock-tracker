# Trade Compass v1.7.1 — 指數型 ETF 投資分析專用頁面

## 目的與安全界線

- **僅更新指數型 ETF 頁面**：改名為「指數型 ETF 投資分析」，保留雙日期持股比較，拿掉該頁重複的外資／投信／自營商期間選單和持股表右側重複法人欄。
- 添加「成分股法人摘要」：近 **5、20 個交易日**，資料只讀既有 `data/institutional/latest.json`，不新增法人抓取器、不變更其保存年限。只有已載入完整持股時才彙總該 ETF 成分股的法人淨買賣超；不表示 ETF 本身的買賣。
- 原本的「三大法人籌碼」頁面、主動式 ETF、價格／配息／定期定額／分割／XIRR 程式與其工作流程 **不修改**。
- 新增 **資料完整度** 後台：每個交易日 21:05 讀取已有的持股索引及實際快照，只有兩個以上有效日期才標記可比較。未取得的資料仍標記 unavailable，不會偽造持股股數。
- 指數型 ETF 歷史價格與配息 **沿用現有** `update-index-etf-prices.yml`；三大法人沿用現有 `update-institutions.yml`。此更新包不新增會改動上述工作流程的動作。

## 上傳檔案

```
index_etf_focus.js
scripts/install_index_etf_focus.py
scripts/install_index_etf_focus_remote.py
scripts/build_index_etf_coverage.py
scripts/publish_index_etf_coverage.py
.github/workflows/install-index-etf-focus.yml
.github/workflows/update-index-etf-coverage.yml
```

全部都是新增檔案。無需覆蓋 `index.html`、`index_etf.js` 或任何三大法人檔案。保留 GitHub 原資料檔。

## 安裝步驟

1. 先把上述 7 個檔案依相同路徑上傳 GitHub `main`。上傳前先備份交易資料與目前專案。
2. 在 GitHub **Actions** 執行 `手動整合指數型ETF投資分析介面（不改三大法人）`。它只透過 GitHub Contents API 向最新 `index.html` 插入 `index_etf_focus.js` 的 script 標籤，不會修改 `.github/workflows/`。
3. 由你原本已正常運作的**網站發布流程**重新部署；確認發布的網站同時包含 `index_etf_focus.js`。若 GitHub Pages 使用 `_site` 明確檔案清單，請手動把 `index_etf_focus.js` 加入複製清單，或交給 Codex 對最新 workflow 增量修改（不要使用舊 YAML 覆蓋）。
4. 在 Actions 手動執行 `更新指數型ETF資料完整度（只寫狀態檔）` 一次。它只更新 `data/index-etf/availability.json`。若網站使用 `_site` 清單發布，需要確認 `data/index-etf/` 被完整發布。後續每交易日台灣時間 21:05 自動檢查。
5. 到線上網站檢查 `index_etf_focus.js` 不再是 404、ETF 頁面更名且法人摘要出現。檢查原三大法人查詢功能和資料均正常。

## 證據和局限

- 成分股比較須兩份經驗證 `kind=actual_portfolio`、`verified=true` 的完整歷史快照，每份至少 40 檔。PCF／申贖清單不可冒充。
- 法人摘要依持股中各成分股的法人交易資料**直接合計股數**，不是市值加權，也不是 ETF 的持股增減；欠缺資料時會標示涵蓋股票數。
- 既有資料源若不含 5／20 日的法人累計欄位，摘要顯示 `—`；不自動歸零。
- 每日覆蓋狀態只反映 GitHub 內已存在的檔案，並不抓取不存在的官方 ETF 完整持股。本更新包**不宣稱已接通三家投信的實際持股歷史來源**。
- GitHub Pages 發布來源需依實際儲存庫設定確認；若仍回傳 404，須將 JS 與索引資料加入發布資產，不能只看 Actions 的綠勾。
- 資料只供研究用途；第三方與自動化來源可能延遲、缺漏或錯誤，投資前應與投信、證交所和券商資料核對。

## 故障排除

- GitHub Actions `workflow not found`：確認兩個 YAML 已提交到 `.github/workflows/` 且 repo Actions 已啟用。
- 安裝流程回覆 `找不到唯一的 index_etf.js`：你的首頁已大幅修改，安裝器會安全停止；不要用舊版 `index.html` 覆蓋。
- 網站仍顯示舊名稱：確認 `index_etf_focus.js` 在 Pages 可讀、首頁已載入、重新部署並強制刷新。
- 持股無法比較：確認 `data/index-etf/indexes/*.json` 及 `data/index-etf/history/*/*.json` 是否有符合來源驗證的完整實際持股；不能由法人資料推得。
