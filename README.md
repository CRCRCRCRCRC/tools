# 萬能工具箱

繁體中文靜態工具網站，使用 HTML、CSS 與 JavaScript，可直接部署至 GitHub Pages，不需要建置或後端服務。

## 本機預覽

在此資料夾執行：

```sh
python -m http.server 8000
```

在瀏覽器開啟 `http://localhost:8000`。請透過本機 HTTP 伺服器預覽，以便正常載入共用 SVG 圖示。

## 工具

- 圖片拉伸／壓扁：上傳、拖放或貼上圖片；獨立調整寬高、百分比縮放、鎖定原始比例、快速變換、原圖對照及 PNG／JPG／WebP 下載。
- 字數計算：中英文字、數字、標點、行數及 UTF-8 位元組統計。
- Markdown 編輯器：文字編輯與即時預覽。
- 代碼測試：編輯 HTML、CSS、JavaScript，於新分頁查看結果。
- 隨機密碼產生器：設定密碼長度及字元類型。
- QR Code 工具：產生、下載與辨識 QR Code。
- 隨機輪盤：輸入選項並隨機抽選。

圖片工具位於 `tools/image-stretcher/`，圖片只在瀏覽器內處理。輸入支援 PNG、JPG、WebP、GIF、BMP，單檔最大 50 MB、來源最大 5,000 萬像素；輸出每邊 1–8,192 px，總像素最多 2,400 萬。超出輸出限制的來源圖片會先等比例縮小。GIF 匯出為靜態圖片；JPG 的透明區域會填入白色。

首頁提供搜尋與分類，按 `/` 可快速聚焦搜尋欄。所有頁面支援手機排版及鍵盤操作。

## 部署至 GitHub Pages

將本資料夾的網站檔案更新到原本部署網站的儲存庫，保留以下結構：

```text
index.html
style.css
script.js
site.css
assets/
tools/
```

`site.css` 是所有頁面共用的樣式；`assets/` 提供本機 SVG 圖示。部署時需一起上傳。連結使用相對路徑，可放在 GitHub Pages 的儲存庫子路徑。

Markdown 與 QR Code 工具沿用 CDN 函式庫，需要網路連線；圖片工具不依賴第三方函式庫。

## 驗證

使用 Node.js 22 以上與已安裝的 Chrome／Chromium：

```sh
node tests/browser-smoke.mjs
```

若瀏覽器不在預設位置，可用 `CHROME_PATH` 環境變數指定執行檔。測試不需安裝 npm 套件，會啟動本機伺服器和無介面的瀏覽器，檢查搜尋、圖片處理、實際下載檔案、既有工具與響應式排版。截圖和下載檔會儲存在執行時顯示的暫存資料夾。
