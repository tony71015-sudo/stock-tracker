# Trade Compass v1.5.3｜其他主動式 ETF 追蹤擴充

**僅更新新增檔案與指定前台、抓取器，不要覆蓋既有三大法人工作流程。**

## 提供功能
- 原統一工作流程（00981A、00403A、00988A）保留不動。
- 新增一個工作流程，呼叫開源 TWActiveETFCrawler 的 `--all`，嘗試下載其 README 所列另外 **20 檔純台股主動式 ETF**。它不是投信官方 API；不能承諾 GitHub Runner 可穩定讀取。
- 對每個 ETF 各自驗證資料日期、代號唯一性、15～200 檔股票、股數整數與權重總和合理性，通過才保存每日檔；資料沒過或只有一日，前台顯示「暫時無法比較」。
- 其餘 42 檔清單中**未獲這套抓取器支援**的海外股票型、債券型及其他基金，只保留查詢入口和「暫時無法比較」標示。這不代表其投信沒有資料。
- 兩日期增減僅表示持股快照變化，不能直接當作經理人單日買進／賣出明細。

## 安裝
1. 備份原網站交易 JSON 與主動 ETF 快照 JSON。
2. 將更新包解壓縮，依路徑上傳 4 個指定檔案至 GitHub `main`：
   - `scripts/import_other_active_etfs.py` **新檔**
   - `.github/workflows/update-other-active-etfs.yml` **新檔**
   - `active_etf.js` **覆蓋**
   - `scripts/update_active_etf.py` **覆蓋**
3. 本包另附 `scripts/import_ezmoney_sqlite.py` 作為匯入器相依檔案備份（v1.5.2 版本）。若你的 00981A 已能運作且已安裝 v1.5.2，**無需覆蓋這個檔案**。
4. GitHub Actions 新增「更新其他台股主動式ETF持股並發布網站」，手動 Run workflow/main 一次。
5. 進入 Trade Compass → 主動式 ETF → 「查看全部 42 檔」。有 2 份以上已保存完整快照才能前台比較。此工作流程每次抓取最多 32.5 分鐘，GitHub Actions job 上限 42 分鐘；若來源太慢可能只收集部分標的。
6. 觀察 Actions 中 `Validate and archive available issuer-reported holdings`；如某檔顯示 `unavailable`，代表未取得可驗證資料，不要將該 ETF 認定為沒有持股。

## 資料信任界線
上游開源抓取器的 README 聲稱抓取投信公開持股；本程式驗證**數值與格式**，仍不能獨立確認其網頁來自完整基金投資組合而非 PCF 籃子。正式用於投資判斷前仍應與投信官方當日完整持股揭露核對。所有資料都保有 `provenance` 及 `dataVerification` 註記。

## 容量
每 ETF 每日期一個小 JSON；前台只按需下載指定兩天並保存於 IndexedDB。大量歷史資料仍將累積在 GitHub Repository，應定期監控儲存容量和 Actions 佔用。
