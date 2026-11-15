# Trade Compass v1.7.0｜006208 後台配息檔案

## 這份修正解決什麼

你的 006208 股價已有資料，但前台 `data/index-etf/dividends/006208.json` 回傳 404。此包直接提供一份符合 `index_etf_returns.js` 既有格式的 **006208 官方資料核對起始檔**，加上獨立自動更新工作流程。

提供三個檔案：

1. `data/index-etf/dividends/006208.json`：已核對的 7 筆配息事件（2023–2026），**不是完整上市至今歷史**，各筆來源為富邦投信配息公開資料。
2. `scripts/update_006208_dividends.py`：嘗試從 TWSE 和富邦投信年度頁查詢更多紀錄，只併入可驗證的事件；失敗不刪既有資料。
3. `.github/workflows/update-006208-dividends.yml`：獨立定期執行並安全提交 `006208.json`，不碰三大法人與其他 ETF 工作流程。

## 安裝

將三檔放到 GitHub **相同相對路徑**，提交至 `main`。到 Actions 執行「更新006208富邦台50官方配息（保存後台）」；第一次可選 `full=true` 試查上市後歷年配息。**上游網頁結構可能變更，因此不能保證自動補齊**。

成功後檢查：

- [GitHub 後台資料檔](https://github.com/tony71015-sudo/stock-tracker/blob/main/data/index-etf/dividends/006208.json)
- [GitHub Pages 前台資料檔](https://tony71015-sudo.github.io/stock-tracker/data/index-etf/dividends/006208.json)

**重要：如果後台 GitHub 檔案存在，但 GitHub Pages 連結還是 404，代表網站發布流程未包含 `data/index-etf/dividends/`。** 此時需在你已正常運作的 `Stage public website assets` 階段加入：

```bash
mkdir -p _site/data/index-etf
cp -R data/index-etf/dividends _site/data/index-etf/
```

這個補丁**不會擅自修改現有部署 YAML**，也不會自動發布整站。你可以讓已正常執行的網站發布流程納入上述檔案，或請 Codex 只修改發布清單。

## 配息資料的可信度

七筆事件可在富邦官方年度配息頁核對（2023、2024、2025、2026）；早期年份有缺漏，**不得把未收錄的年份當作零配息**。未來除息日／發放日未確定的預告也不會當成已領取配息。

- 富邦 2024: https://www.fubon.com/asset-management/fund/dividends/by_yield?Fd=0&contact=1&toDate=2024
- 富邦 2025: https://www.fubon.com/asset-management/fund/dividends/by_yield?Fd=0&contact=1&toDate=2025
- 富邦 ETF 配息: https://websys.fsit.com.tw/FubonETF/Dividend/Detail.aspx?stkId=006208

如果你之後取得完整歷年官方 CSV，可繼續在 `006208.json` 中追加經核對的事件。
