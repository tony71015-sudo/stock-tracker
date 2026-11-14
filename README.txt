Trade Compass — 修正 index_etf_returns.js 404

1. 解壓 ZIP，將 .github/workflows/fix-index-etf-returns-pages.yml 上傳至 GitHub 相同路徑（新增檔案）。
2. 提交至 main。
3. 在 GitHub Actions 選「修正指數型ETF報酬試算檔案發布」→ Run workflow。
4. 檢查執行日誌 MATCHED_PUBLISHERS / UPDATED；程式只會在原有網站部署流程的 cp 指令加上 index_etf_returns.js，不會覆蓋首頁或資料。
5. 再執行「更新三大法人、股票行情並發布網站」或其他已確認有 Deploy GitHub Pages 步驟的既有發布流程。
6. 驗證 https://tony71015-sudo.github.io/stock-tracker/index_etf_returns.js 不再 404。
7. 返回網站「指數型 ETF × 法人」按 Ctrl+F5。

若補丁回報「No existing Pages staging cp command found」，代表你後續更換了部署方式；不要盲目覆蓋舊版工作流程，請提供新版工作流程內容。
GitHub Actions GITHUB_TOKEN 所推送的提交通常不會自動觸發另一個 push workflow，所以第五步仍需手動執行部署。
