# Trade Compass｜指數型 ETF 分頁只保留報酬試算

## 完成後畫面
- 左側選單：「指數型 ETF 報酬試算」
- 上方麵包屑與瀏覽器標題：「指數型 ETF 報酬試算」
- 頁面大標題：「指數型 ETF 股價與投入報酬試算（含配息、分割、總收益）」
- 保留 0050／006208／009816 切換選擇器，以及原來的報酬、配息、分割、定期定額、圖表、現金流與報酬試算功能。
- 隱藏此分頁原有的持股差異比較、三大法人摘要、手動匯入持股 CSV 等區塊。
- 其他分頁完全不變，既有資料不刪除。

## 安裝：上傳兩個檔案（保持相同目錄）
1. `scripts/apply_index_etf_returns_only.py`（新增）
2. `.github/workflows/apply-index-etf-returns-only.yml`（新增）

到 GitHub Actions 選擇「一次性調整指數型ETF為報酬試算專頁」→ Run workflow。它會直接修改儲存庫現有的 `index_etf.js` 和 `index.html`，並提交；不必手動覆蓋這兩個檔案。

接著執行原本的「更新三大法人、股票行情並發布網站」以發布頁面。**只需要全新執行，不要在舊 run 按 Re-run jobs。**

安裝時若 index_etf_returns.js 尚未被首頁載入，流程會安全停止，避免把網站變成空白頁。若 GitHub Actions 不能 push，請檢查儲存庫 Settings → Actions → General → Workflow permissions 是否給予 Read and write permissions；不建議為了此介面進行強制推送。

## 注意
- 此補丁只改畫面，不重寫收益計算、不造假 ETF 歷史持股。
- 不影響三大法人籌碼頁、主動式 ETF、股票行情查詢、006208 快照或 GitHub Pages 其他資產。
- 如果原本發佈流程有別的腳本每次重設 index_etf.js / index.html，需移除該重設步驟。
