# Trade Compass v1.6.1 — 指數 ETF 收盤價圖與投入損益試算（Codex 安全整合包）

## 功能

- 0050、006208、009816：證交所月度 `STOCK_DAY` API 累積每日原始收盤價，持續追加歷史。
- 「指數型 ETF × 三大法人」頁面新增：價格走勢、無限多筆日期/金額投入、依設定日期或下一交易日收盤價模擬買入、股數/成本/均價/現值/未實現損益/百分比、持有期間最大獲利與最大虧損、兩條歷史走勢。
- 原有指數 ETF 完整持股比較、外資/投信/自營商籌碼功能保持不變；行情不等於持股。
- 投入資料只存 localStorage，不傳至公開 GitHub。

## 複製檔案與安裝（推薦交給 Codex）

把 ZIP 中 4 個程式檔放入倉庫相同路徑：

- `index_etf_returns.js`（新增）
- `scripts/update_index_etf_prices.py`（新增）
- `scripts/install_index_etf_returns.py`（新增，整合時執行一次）
- `.github/workflows/update-index-etf-prices.yml`（新增）

在 GitHub 倉庫根目錄執行 `python scripts/install_index_etf_returns.py`，它只會對現有 `index.html` 和 `index_etf.js` 加入必要介面入口。如果 Codex 已大幅重構 index ETF 頁面且找不到位置，安裝腳本會停止，請 Codex 對照下方的整合方式人工修改，不要用舊檔覆蓋現在的網站。

整合方式：

1. `index.html` 原本 `<script src="index_etf.js" defer></script>` 下一行新增 `<script src="index_etf_returns.js" defer></script>`。
2. `index_etf.js` 的指數 ETF `render()` HTML 回傳末端增加 `window.TradeCompassETFReturns?.html(state.fund) || ''`。
3. 第一次進入 Actions「更新指數型 ETF 每日收盤價」→ Run workflow → rebuild=true，回補 2024 年起價格。之後週一至週五 20:30（台灣時間）增量更新。需開啟 Actions 對 repo 的 contents:write 權限。
4. 如既有全站網站發布 workflow 會產生 `_site`，請確認它也會複製 `data/index-etf` 和新增 JS；GitHub Pages 必須部署到新檔案才可使用。

## 計算口徑

- 買入日期如非交易日，使用當日之後第一筆可用收盤價；超出回補區間的日期不可臆測成交價。
- 預算扣除買入成本及可設定的買入手續費，向下取整成整股；現金餘額不計入持股成本或損益。
- 未實現損益 = 持有股數 × 該日收盤價 − 累積含手續費買入成本；報酬率 = 未實現損益 / 累積買入成本。
- 最高／最低損益為持有期間「每日收盤價」的未實現損益金額；有加碼時會隨成本改變，不是時間加權報酬。
- 0050 2025/06/18 進行 1 拆 4，已處理跨分割日持股股數；其他未來分割需另加事件，避免假損益。
- 不含現金配息、賣出稅、賣出費用、滑價、配息再投入。此版報酬標示為「價格報酬」，不是含息總報酬；不可將其當成實際券商帳務。
- 資料缺失或日期尚未回補必須明示；切勿產生虛構價格。各 ETF 的「持股股數變化」與法人市場交易不可視為同一種資料。

## 重要限制

此包是一個「增量功能模組」，不是重裝全站，不包含修復指數 ETF 官方完整持股歷史抓取。現有 0050/006208/009816 的雙日股數比較仍需另外接通實際投資組合資料；不能用 PCF 冒充。價格來源 TWSE STOCK_DAY（原始未還原收盤價），首次下載與實際 GitHub Actions 發布需在 repo 環境執行驗證。
