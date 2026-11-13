# Trade Compass v1.4.2 大盤三大法人歷史日期查詢修正

這是「安全補丁」，只需更新兩個檔案，不須重新上傳 index.html 或個人交易資料。

## 問題原因（2026-11-14）
- 線上 `data/institutional/market-flow.json` 只有 `2026-11-13` 一筆資料；上面的「60 交易日」是另一個個股法人累積功能。
- BFI82U 歷史查詢需使用 `dayDate=YYYYMMDD&type=day`，原腳本錯用 `date=YYYYMMDD`，證交所一直回最新日，造成舊日回報 date mismatch。
- 線上 `.github/workflows/update-institutions.yml` 沒有呼叫 `scripts/update_market_flows.py` 的步驟，因此即使其他法人資料更新，這張大盤歷史表也不會跟著補齊。

## 更新方式
1. **先下載網站內的 JSON 備份**，保護個人持股紀錄。
2. 解壓縮本補丁，注意 `.github` 是隱藏資料夾（Windows 檔案總管可能需顯示隱藏項目）。
3. 到原 GitHub 專案，逐一覆蓋：
   - `scripts/update_market_flows.py`
   - `.github/workflows/update-institutions.yml`
4. GitHub Commit changes（提交到 main）。
5. 到 **Actions → 更新三大法人、股票行情並發布網站 → Run workflow → mode: bootstrap → Run workflow**。
6. 到本次執行記錄，確認出現 `Fetch official TWSE whole-market institutional money flows (BFI82U)`；觀察 log 中 `Saved N validated dates`，N 大於 1 才代表真正有歷史日期。
7. 確認 `Deploy GitHub Pages` 綠勾，再重新整理網站「三大法人籌碼」分頁的大盤日期下拉。

## 驗證資料（重點）
在 GitHub 上點開 `data/institutional/market-flow.json`，確認 `records` 包含多個不同的 date。若仍只有一天，請貼 Actions 中 `Fetch official TWSE whole-market institutional money flows (BFI82U)` 步驟最後 20 行；可能是官方回應格式、存取限制或交易日可用性問題。

提醒：單次 bootstrap 可能花費數分鐘，依網路及證交所回應而異，不能保證能取到全部 90 天。程式只保存核對日期正確且金額加總一致的紀錄。沒有資料時不會顯示假數字。
