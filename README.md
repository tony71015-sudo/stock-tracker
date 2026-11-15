# Trade Compass：指數型 ETF 投資分析頁面發布修正

## 問題
原網站使用 `_site` 指定檔案發布，沒有複製 `index_etf_focus.js`，即使手動整合成功，網站仍顯示舊版。這份補丁提供一個**獨立、只手動觸發**的 Pages 發布流程，無須修改原有 `update-institutions.yml`，也不會寫入三大法人資料。

## 要上傳的三個檔案（按 ZIP 內目錄結構）
- `index_etf_focus.js`（根目錄；與 v1.7.1 相同）
- `scripts/install_index_etf_focus.py`（安裝器；與 v1.7.1 相同）
- `.github/workflows/publish-index-etf-focus.yml`（新增手動發布流程）

## 操作
1. 備份目前專案，將以上三檔上傳至 GitHub 的相同路徑並提交至 main。不要上傳 README 當成程式。
2. 在 GitHub Actions 選「手動發布指數型ETF投資分析介面」 → Run workflow。
3. 成功後，開啟 `https://tony71015-sudo.github.io/stock-tracker/index_etf_focus.js`，應顯示 JavaScript 而非 404。然後重新整理網站。
4. 若原本「更新三大法人、股票行情並發布網站」再度執行且仍使用固定複製清單，可能覆蓋這次的發布成果；長期需在**原發布流程**中持久加入新模組。此補丁不是永久修復舊流程漏檔的替代方案。

## 注意
- 此流程不做資料抓取、不得自行產生 ETF 持股，也不會改寫 `institutional.js` 或相關資料。
- 只在 Pages 的暫存發布副本內插入 UI script，不修改 GitHub 原始 `index.html`。
- 如原首頁缺少唯一的 `index_etf.js` 標籤，安全停止，不會破壞首頁。
- 本流程採用 GitHub Pages Actions 發布方法；儲存庫 Settings → Pages → Build and deployment → Source 需為 GitHub Actions，且必須允許 Pages 發布。
- 經驗證的 ETF 實際持股歷史快照仍需另行取得，頁面更名不會補出缺少的持股資料。
