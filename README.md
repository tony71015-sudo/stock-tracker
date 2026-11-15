# Trade Compass v1.7.3 — 行情資料修復（最小補丁）

## 根本原因
- 使用者輸入 `6070`；**力積電正確股票代號為 `6770`**，台達電為 `2308`。
- GitHub Actions 上櫃行情回應曾出現 `Unterminated string...`，即 TPEx 官方 API 回傳不完整 JSON（不是查詢框造成）。截圖顯示上市 1,377 筆、上櫃 0 筆。

## 更新方式（不修改 YAML）
1. 將 `market.js` 覆蓋儲存庫根目錄的 `market.js`。
2. 將 `scripts/update_market.py` 覆蓋 `scripts/update_market.py`。
3. `tests/test_market_repair_v173.py` 可選擇放入原有的 `tests/` 目錄，**不要**上傳 `__pycache__`、`.pyc`、虛擬環境檔。
4. Commit changes 至 main。
5. 從 GitHub Actions 啟動 **全新的**「更新三大法人、股票行情並發布網站」流程，不要 Re-run jobs。確認 `Deploy GitHub Pages` 成功，且 `data/market/latest.json` 中 `markets.TPEX.count` 不再是 0。
6. 以 `6770`、`2308`、`5483`、`2330` 測試；`6070` 應顯示正確代號提示。

## 更新內容
- 對 TWSE / TPEx JSON 實作最多 4 次重新取得、讀取長度檢查、完整 JSON 解析驗證；避免 API 不完整回應使市場資料更新失敗。
- TPEx 主入口失敗後嘗試官方另一個資料入口，但**仍需通過相同表格解析和最低筆數驗證**，不同資料格式不會被硬塞進系統。
- 若兩者失敗，維持先前已確認的上櫃快照；不編造資料。
- 以暫存檔原子替換 JSON，避免意外中斷造成不完整檔。
- 搜尋不存在代號 6070 時提供力積電 6770 的查詢建議；可直接輸入台達電/2308。

## 已知限制
- 若官方 TPEx API 持續回傳損毀 JSON，重試無法保證成功。上櫃無舊快照時仍會顯示 0，應檢查 Actions 警告或嘗試之後再執行。
- 使用者最近可能透過 Codex 更新 `market.js` 與抓取器。本包以先前 v1.7.2 原始碼為基底；安裝前請比對差異，避免覆蓋較新的修改。
- 其他獨立模組（0050、006208、009816、三大法人、ETF 試算）均不修改。
