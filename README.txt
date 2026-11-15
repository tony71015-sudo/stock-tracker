Trade Compass 三大法人與行情 JSON 同步衝突修正
版本：2026-11-15

本包包含：
  .github/workflows/update-institutions.yml       (覆蓋既有檔)
  scripts/reconcile_public_market_data.py          (新增檔)

安裝：
1. 先備份現有 update-institutions.yml。
2. 依原始相對路徑上傳兩個檔案到 GitHub main。
3. 在 Actions 執行「更新三大法人、股票行情並發布網站」，mode=auto。
4. 確認 Publish public market datasets、Stage public website assets 和 Deploy GitHub Pages 均成功。
5. 確認網址 /stock-tracker/index_etf_returns.js 不再回傳 404。

原問題：四個 JSON 在 GitHub Actions 並行時 rebase 衝突。
修正：在暫存區保留新抓到的 JSON，擷取最新 main 後，
若遠端檔案未變則採本次抓取資料；若同時更新，
市場資金流按日期合併、其餘快照優先保留較新時間戳。
對無法辨識之來源，不覆蓋遠端資料。最多重試 5 次，不強推。

注意：
- 這次只修三大法人、行情及網站發布；不變更主動式 ETF 抓取器。
- 網站已有的指數 ETF 報酬程式會被納入發布，但不代表自動補完其尚缺的正式歷史股數資料。
- 如有其他最近修改過的 YAML 設定，覆蓋前應先核對差異。
