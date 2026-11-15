# 指數型 ETF 持股比較修復補丁（來源驗證版）

## 問題
前端 `index_etf.js` 需要 `data/index-etf/indexes/<code>.json` 中至少兩個有效日期，及 `data/index-etf/history/<code>/<date>.json` 中每份至少 40 檔的完整股票持股。先前這三檔的索引都是空的；v1.7.1 只修改了介面沒有建立持股資料。

## 安裝
上傳 2 個新檔：
- `scripts/update_index_etf_holdings.py`
- `.github/workflows/update-index-etf-holdings.yml`

提交至 `main`，至 Actions 手動執行「更新指數型ETF實際持股（官方來源實驗版）」。
**請勿覆蓋三大法人更新工作流程、`index_etf.js`、主動 ETF 程式。**

## 限制及警告
這是官方頁面解析的**實驗版**，目前無法在本環境連線對三家投信做實際跑測。不同投信網站可能使用動態載入，請檢查 Actions 的各檔日誌；只有完整表格解析成功才會產生資料。若全部失敗，工作流程會紅燈且不會亂寫假資料。若其中一檔失敗，其他檔仍可保存。**不允許拿 PCF 申購贖回籃子冒充實際持股**。

官方來源：
- 0050 https://www.yuantaetfs.com/product/detail/0050/ratio
- 006208 https://websys.fsit.com.tw/FubonETF/Fund/Assets.aspx?stkId=006208
- 009816 https://www.kgifund.com.tw/Fund/Detail?fundID=J023

## 網站仍需發布這兩類資料
- `data/index-etf/indexes/` （日期索引）
- `data/index-etf/history/` （實際持股）

若原發布流程使用手動複製清單，必須另外納入上述目錄。該步驟為避免對既有 YAML 造成 GitHub workflow 權限與合併衝突，未寫進本補丁。

## 確認與比較
- 第一次有效抓取：只有 1 日期，還不能比較。
- 第二次不同交易日的有效抓取：至少 2 日期，可在前端選兩個日期比較。
- 檢查 index JSON `dates` 是否有兩筆、history JSON `holdings` 是否有至少 40 檔、`verified` 是否為 true、`kind` 是否為 `actual_portfolio`。
- ETF 持股股數變化受基金申贖及價格影響，不等於經理人實際成交；法人買賣超是另外一套市場資料。

## 風險及已知問題
公開來源可能更新 HTML、採用分頁或 JavaScript 非同步載入。本程式會失敗關閉（fail closed），不能保證三檔都能取得完整清單。對於前端的資料來源標記，目前 `verified` 代表**通過完整性格式測試且取自官方 URL**，不是人工逐筆核對。請依官網交叉檢查。這版沒有自動歷史回補數年前的每日持股；從新增流程開始逐日累積。
