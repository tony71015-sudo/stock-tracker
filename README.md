# Trade Compass | 主動式 ETF 後台缺檔狀態標示

## 功能

本補丁不修改 ETF 持股資料或其他比較公式。它會根據 GitHub Pages 公開的 `data/active-etf/status.json` 和各個 `data/active-etf/indexes/<ETF>.json`，在「主動式 ETF 每日持股歷史比較」下方新增一個狀態區塊：

- 可比較：找到兩個以上歷史日期索引（仍需實際驗證兩日持股 JSON）
- 只有單日資料：目前不可比較
- 尚無歷史持股檔：找不到或日期索引空白
- 來源未通過驗證：後台狀態為 `not_verified` 或含 PCF、完整性不合格原因
- 讀取失敗：網頁無法取得資料索引

可依狀態篩選與手動重新檢查；顯示最後可用日期及來源錯誤原因，不把缺檔當清倉。

## 安裝（不覆蓋目前已修復的 active_etf.js）

1. 將 `scripts/active_etf_availability_embed.js` 上傳到 GitHub 同路徑。
2. 將 `.github/workflows/install-active-etf-availability.yml` 上傳到 GitHub 同路徑，提交到 main。
3. 開 GitHub Actions，執行「安裝主動式 ETF 資料缺漏標示」，選 main，按 Run workflow。
4. 安裝器會讀取最新 main，把獨立模組追加到既有 `active_etf.js`。沒有覆蓋前台已完成修改。再次執行不會重複新增。
5. **重要：** 若目前網站採用 Actions 將 `active_etf.js` 複製進 `_site` 再發布，請另外觸發「更新其他台股主動式ETF持股並發布網站」等既有部署工作流程一次，將更新的 JS 發布到 GitHub Pages。
6. 網站按 Ctrl+F5，切到「主動式 ETF 持股異動」查看新增表格。

## 限制

此功能使用既有後台資料，不會虛構缺失的持股。倘若狀態檔已過期，顯示的原因也可能落後。已有兩日「索引」不保證完整持股已通過人工逐筆核對；PCF 資料不能直接視為實際持股。

注意：請保留 GitHub 既有資料與工作流程。首次執行成功不等於網站已更新，仍需部署。
