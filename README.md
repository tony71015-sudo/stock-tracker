# Trade Compass v1.6.9 — 圖表 X/Y 軸、分割標記與官方配息重讀

## 內容

本版只更新專案根目錄 `index_etf_returns.js`，沿用 v1.6.8 的定期定額、額外加碼、分割、配息、XIRR 與本機歷史資料功能。

- 「ETF 原始收盤價」及「投資組合總損益」分別提供 X 軸日期、Y 軸金額刻度、背景參考線。
- 滑鼠移至圖表可查看指定交易日的詳細價格或損益；損益圖的提示包括當日持股與累計投入。
- 0050 的 2025-06-18 **1 拆 4**會顯示垂直標記。原始股價出現分割落差屬正常；損益圖應按分割後股數計算。
- 0050、006208 自動讀取已發布的 `data/index-etf/dividends/{代號}.json`，提供「重新讀取官方配息資料」按鈕。009816 按不分配收益政策處理。
- 如果配息資料缺失或沒有有效事件，頁面顯示警告，**不把缺值視為 0**。

## 安裝

1. 備份 GitHub 根目錄既有 `index_etf_returns.js`。
2. 把 ZIP 內的 `index_etf_returns.js` 上傳到專案根目錄並覆蓋，提交至 `main`。
3. 執行**你已確認能成功的** GitHub Pages 發布流程。注意：需包含 `index_etf_returns.js` 在公開網站檔案中；此 ZIP **不修改 Actions YAML**。
4. 網站切換「指數型 ETF × 法人」，按 Ctrl+F5。確認 `https://tony71015-sudo.github.io/stock-tracker/index_etf_returns.js` 不再回 404。
5. 選 0050 / 006208、選含息模式後按「重新讀取官方配息資料」。

## 配息資料格式

網站既有 JSON 路徑：`data/index-etf/dividends/0050.json`、`006208.json`。

```json
{"etf":"0050","events":[{"exDate":"YYYY-MM-DD","paymentDate":"YYYY-MM-DD","amount":0.0}]}
```

以上為格式說明而非可用的真實紀錄。有效紀錄需以正式日期與正的每股配息填寫，並核對投信公告。**如果 GitHub 只有資料庫 JSON、Pages 未部署 JSON，按重新讀取仍會顯示 404。**

本版不會自行蒐集或捏造配息，只讀取後台已發布資料。缺少配息時可以匯入經核對 CSV 暫存於本機，或者先把官方 JSON 發布至 GitHub Pages。

## 驗證

已通過 Node.js 語法檢查與模擬圖表／配息 JSON 測試，未在你的 GitHub Pages 實際部署。建議先確認線上主程式檔案發布成功，再測試圖表與配息。
