# Trade Compass：指數型 ETF 報酬試算分頁，直接修改並立即發布（v2）

## 修正內容

- 左側選單／導覽標題：**指數型 ETF 報酬試算**
- 頁面主標題：**指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）**
- 只顯示 0050／006208／009816 的基金選擇器，以及原本的報酬試算模組；不再顯示持股比較、法人資訊或持股 CSV 匯入。
- 不改動 ETF 股價、配息、持股歷史、三大法人、股票行情資料，也不重寫投資報酬公式。
- 此版本在**同一個工作流程**內先修改 `index_etf.js`、`index.html`、提交，再編排 `_site`，最後直接部署 GitHub Pages；不需重跑既有三大法人／行情發布工作流程。

## 安裝：只上傳兩個檔案

1. `scripts/force_returns_only.py` → GitHub 的 `scripts` 資料夾。
2. `.github/workflows/publish-returns-only-direct.yml` → GitHub 的 `.github/workflows` 資料夾。
3. 提交 `main` 後，進入 GitHub → Actions → **立即修正並發布指數型ETF報酬試算專頁** → **Run workflow**（開一個新的 run，不使用舊 run 的 Re-run jobs）。
4. 確認 **Directly fix ETF page source**、**Stage website without editing other workflows**、**Deploy GitHub Pages** 皆為綠色。
5. 以 `Ctrl+Shift+R` 強制重新整理 `https://tony71015-sudo.github.io/stock-tracker/`；左側選單應改為「指數型 ETF 報酬試算」。

## 重要提醒

- 網站必須已在 `index.html` 載入 `index_etf_returns.js`，否則腳本會安全停止而不是留下空白頁。
- 過去的舊發布流程如果之後又從**舊版提交**發布，仍可能蓋掉新畫面；此工作流程會直接提交兩個網站原始碼，正常情況下後續從 main 發布也會保持新畫面。
- 不要將整個 ZIP 直接放在儲存庫根目錄。需解壓縮並保持相對路徑。
- 如果執行失敗，請提供該工作流程**第一個紅色步驟**的完整錯誤文字。不要盲目繼續更改其他工作流程。
- 這份程式已用先前保存的 `index.html` 和 `index_etf.js` 完成兩次重複安裝與 JavaScript 語法測試；尚未直接取得你的最新 main 原始碼，也尚未在你的 GitHub 實際執行。
