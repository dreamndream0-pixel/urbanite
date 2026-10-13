# LINE 機器人(主站與店家共用)

主站 URBANITE 與每個店家官網共用同一套 LINE 機器人程式,資料依 `shop_id` 分開。

## 部署

1. 執行 `supabase/migration-line-bot-shops.sql`。LINE 機器人的 5 張資料表會加上 `shop_id`,舊資料歸 URBANITE。這份 SQL 可以重複執行,不會刪除資料。
2. 部署程式。SQL 還沒執行前,主站照舊運作;店家 LINE 會沿用固定回覆,後台只能使用「連線設定」。

## 運作方式

- `lib/line-channel.ts`:用 `runAsShop(shop, fn)` 指定目前的店家,在這個範圍內:
  - `botChannel()`:主站讀串接設定的金鑰,店家讀自己的 LINE 金鑰(`SHOP_LINE:<shopId>`)。
  - `botSiteUrl()`:主站網址或店家子網域。
  - `lineBotDb()`:依店家過濾的資料表查詢。
- Webhook `/api/line/webhook`、按鈕追蹤 `/api/line/r`、後台 `/api/admin/line-bot/*` 都依網域決定是哪家店。
- 排程 `/api/cron/line` 逐筆送出各店家到時間的推播,每家店都用自己的金鑰。
- 店家第一次使用時套用 `SHOP_DEFAULT_BOT_CONFIG`:
  - 歡迎訊息加綁定按鈕。
  - 「綁定」「訂單」查詢開啟;優惠券、購物金、會員資料關閉。
  - 其他訊息不自動回覆。
- 訂單通知統一在「系統設定 → 通知」設定,LINE 機器人後台不再有訂單通知分頁。

## 店家串接教學(給店家)

1. 到 LINE Official Account Manager 建立官方帳號,並啟用 Messaging API。
2. 到 LINE Developers,在**同一個 Provider** 底下:
   - Messaging API channel:複製 Channel secret,並發行 Channel access token。
   - LINE Login channel:Linked LINE Official Account 選上面那個官方帳號,並把 channel 設為 Published。
3. 到店家後台 →「LINE 機器人」→「連線設定」:
   - 貼上 Messaging API 的金鑰,以及 LINE Login 的 Channel ID 和 secret。
   - 把畫面上的 Webhook URL、Callback URL 分別貼回 LINE Developers。
4. 到 LINE Official Account Manager → 回應設定,關閉「自動回應訊息」。
5. 用自己的帳號在官網會員中心按「訂閱 LINE 通知」,之後就能用「傳送測試給自己」預覽訊息。

## 驗證

```
node scripts/test-line-bot-shops.cjs
```
