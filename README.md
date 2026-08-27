# Goodnight Girls Shop

正式部署建議組合：

- GitHub：原始碼與版本控管
- Vercel：前台與後台介面部署
- Supabase 或 Neon：正式資料庫

## 本機開發

```bash
npm install
npm run dev
```

## 正式部署到 Vercel

1. 將此專案推到 GitHub。
2. 在 Vercel 建立新專案並匯入 GitHub repo。
3. Framework Preset 選 `Next.js`。
4. Build Command 使用 `npm run build`。
5. Install Command 使用 `npm install`。
6. Production Branch 使用 `main`。

## 目前範圍

- 前台商品頁
- 顏色、尺寸、數量選擇
- 加購商品
- 購物車與結帳摘要
- 後台訂單、庫存、營收、活動設定介面

## 下一階段正式營運項目

- 資料庫 schema：商品、變體、庫存、訂單、顧客、付款紀錄
- 後台登入與權限
- 金流串接
- 物流與發票串接
- 訂單通知信
