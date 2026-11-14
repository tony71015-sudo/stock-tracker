# Trade Compass v1.5.5 — 修復 GitHub Pages `data/index-etf` 不存在的發布錯誤

## 根因
v1.5.4 三個 Actions 都寫了：
`cp -R data/institutional data/market data/active-etf data/index-etf _site/data/`
若新分頁的 `data/index-etf/` 還未上傳，`cp` 會返回 exit 1，中斷整個網站發布。

## 修正
- 三個工作流程均改用逐一判斷資料夾是否存在後再複製。缺少資料只顯示 notice，不會阻止部署。
- 修正 `update-institutions.yml` 先前仍為單次 `git push` 的問題，改成 fetch/rebase/安全重試 5 次。不使用 force push。
- 不修改股票成本、持股紀錄、Python 抓取器或前端比較邏輯。

## 安裝（只需 3 個 YAML 檔）
將 ZIP 中以下檔案覆蓋 GitHub 同路徑並 Commit 到 main：
1. `.github/workflows/update-institutions.yml`
2. `.github/workflows/update-active-etf-holdings.yml`
3. `.github/workflows/update-other-active-etfs.yml`

在 GitHub Actions 手動 Run workflow (main) 其中一個更新流程，確認 `Stage public website assets` 或 `Stage public site` 綠勾，Deploy GitHub Pages 綠勾。

注意：如果 `index_etf.js` 也尚未上傳，下一步可能出現 `cp: cannot stat 'index_etf.js'`，請一併上傳前一版 v1.5.4 補丁的 `index_etf.js`。若預期新分頁正常顯示，還應上傳 `data/index-etf/indexes/*.json` 三個空索引檔；本修正只是允許暫時缺少資料時正常部署。
