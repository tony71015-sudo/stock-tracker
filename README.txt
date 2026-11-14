Trade Compass v1.5.0 00981A 匯入修補

原因：import_ezmoney_sqlite.py 將網站 ETF 目錄 catalog.json 當成必要白名單，若未讀到 00981A 就誤報 Unsupported code。

安裝：GitHub 原專案打開 scripts/import_ezmoney_sqlite.py，使用本 ZIP 中同路徑檔案覆蓋，Commit changes，回 Actions 的 00981A 更新流程重新執行。

注意：此補丁修正代號驗證，不等於已確認 SQLite 資料表符合預期，也不保證抓到兩天持股。下次若仍失敗，請貼 Validate and import 步驟錯誤紀錄。
