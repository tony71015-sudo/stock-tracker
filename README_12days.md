# Trade Compass｜指數型 ETF 12 個有效持股日期目標

## 範圍

- 0050、006208、009816 各自以 **12 個不同交易日期的有效完整持股快照**為目標。
- 006208 每次重新查詢近期最多 12 個交易日（原工作流程預設為 4）；0050 與 009816 目前來源主要只揭露最近一個日期，會在每個有新完整持股資料的交易日逐步累積。
- **不會假造、複製或改日期**來湊足 12 份。若能取得有日期、股數、權重、來源且通過驗證的歷史資料，日後可另外接入歷史回補來源。
- 不修改既有的三大法人籌碼、ETF 股價/配息與報酬計算頁面。

## 更新檔案

1. `.github/workflows/update-index-etf-holdings.yml`：將 `backfill_days` 預設改為 `12`，並在更新索引後產生覆蓋報告。
2. `scripts/report_index_etf_12days.py`：新增，檢查已驗證日期並產生 `data/index-etf/coverage/twelve-day-goal.json`。

## 安裝

在 GitHub 專案依上述路徑新增或替換檔案，再提交至 `main`。如你使用 Codex 更新過原工作流程，請先比較差異，不要整份覆蓋已客製的內容。

到 Actions 的「更新指數型ETF持股（來源診斷與安全累積版）」執行 `Run workflow`，輸入 `backfill_days=12`。等待新的交易日累積 0050、009816；當天重跑不會增加不同日期數。

在 GitHub 查看 `data/index-etf/coverage/twelve-day-goal.json` 的 `availableTradingDates` / `remainingToTarget`；GitHub Pages 仍需要發布 `data/index-etf/indexes/` 及 `history/`，才能在網站查詢。

## 避免誤解

目前截圖證據為 0050=1 日、006208=12 日、009816=1 日。這是已保存的不同日期數，不是未來一定能自動抓到的保證。新的 workflow 設定無法讓 0050 與 009816 立即擁有過去 12 日的持股明細。
