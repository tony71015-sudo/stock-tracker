# Trade Compass v1.5.6 — 其他主動式 ETF 取得持股修正

## 根因與修正
- 以前一次執行 `python main.py --all`，最多 1,950 秒。任何投信網站卡住都可能讓後面的投信完全來不及抓取。
- 改為 **14 家投信依序獨立執行**，每家最多 130 秒，失敗時記錄原因並繼續下一家。
- 移除其他投信匯入端沿用的「距今超過 30 天就拒絕」限制，改為最多可接收 500 天內、每次最多處理 240 個歷史日期（只匯入 SQLite 真正存在的資料）。
- 在 Actions 日誌列出 `SQLITE_ETF`（各檔有多少資料列、日期）與 `ETF_RESULT`（匯入結果）；另附可下載 `active-etf-crawler-diagnostics` 診斷日誌。
- 保留原有統一投信 00981A/00403A/00988A 工作流程、其他主動式 ETF 的 42 檔清單及既有每日 JSON 檔。

## 安裝：只換兩個檔案
1. 將 `scripts/import_other_active_etfs.py` 覆蓋同名檔。
2. 將 `.github/workflows/update-other-active-etfs.yml` 覆蓋同名檔。
3. GitHub `main` 分支 Commit changes。
4. GitHub Actions -> 更新其他台股主動式ETF持股並發布網站 -> Run workflow。
5. 開啟「Collect each supported issuer independently」查看成功/失敗，再開「Validate and archive available issuer-reported holdings」查看 `ETF_RESULT`，並檢查 `data/active-etf/indexes/<ETF代號>.json`。

## 重要限制
- 上游 README 明列 PCF 來源的摩根 00401A、兆豐 00996A、凱基 00407A、永豐 00410A：**禁止將這四檔的 PCF 當作完整基金實際持股**，顯示「暫時無法比較」。其餘投信資料依舊只能作結構驗證，不能把日期差額直接稱為經理人真實買賣。網站標示 `structural_validation_only`。
- 若官網沒有提供完整組合、來源被封鎖、爬蟲失效、或只有單一日期，網頁仍應顯示「暫時無法比較」。
- GitHub Actions Runner 每次重新下載爬蟲；歷史日期由 Trade Compass 的 `data/active-etf/daily` 及 `indexes` 累積，而非自動取得全部上市以來的歷史持股。
- **注意**：本修正版基於先前你提供/已產生的 v1.5.3 和 v1.5.5 程式；無法直接驗證你的 GitHub 最新 main 與真實投信抓取結果。請先備份 GitHub 檔案。
