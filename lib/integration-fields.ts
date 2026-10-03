// 後台「串接設定」欄位定義(前後端共用,不含任何金鑰或加密邏輯)

export type IntegrationField = {
  key: string;
  label: string;
  secret?: boolean; // 金鑰類:後台只寫不讀,顯示遮罩
  type?: 'text' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
};

export type IntegrationGroup = { title: string; description?: string; fields: IntegrationField[] };

const ENV_OPTIONS = [
  { value: 'stage', label: '測試環境' },
  { value: 'production', label: '正式環境' },
];

export const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    title: '藍新金流',
    description: '線上付款(信用卡、Apple Pay 等)。資料在藍新商店後台 → 商店管理 → API 串接金鑰。',
    fields: [
      { key: 'NEWEBPAY_ENV', label: '環境', type: 'select', options: ENV_OPTIONS },
      { key: 'NEWEBPAY_MERCHANT_ID', label: '商店代號 MerchantID' },
      { key: 'NEWEBPAY_HASH_KEY', label: 'HashKey', secret: true },
      { key: 'NEWEBPAY_HASH_IV', label: 'HashIV', secret: true },
    ],
  },
  {
    title: '藍新物流',
    description: '超商取貨門市地圖、建立託運單、列印標籤。',
    fields: [
      { key: 'NEWEBPAY_LOGISTICS_ENV', label: '環境', type: 'select', options: ENV_OPTIONS },
      { key: 'NEWEBPAY_LOGISTICS_UID', label: '物流 UID' },
      { key: 'NEWEBPAY_LOGISTICS_HASH_KEY', label: 'HashKey', secret: true },
      { key: 'NEWEBPAY_LOGISTICS_HASH_IV', label: 'HashIV', secret: true },
    ],
  },
  {
    title: 'LINE 登入',
    description: 'LINE Developers → LINE Login channel。',
    fields: [
      { key: 'LINE_LOGIN_CHANNEL_ID', label: 'Channel ID' },
      { key: 'LINE_LOGIN_CHANNEL_SECRET', label: 'Channel secret', secret: true },
    ],
  },
  {
    title: 'LINE 官方帳號(Messaging API)',
    description: '訂單通知、LINE 查詢訂單使用。需與 LINE 登入在同一個 Provider 底下。',
    fields: [
      { key: 'LINE_MESSAGING_CHANNEL_SECRET', label: 'Channel secret', secret: true },
      { key: 'LINE_MESSAGING_ACCESS_TOKEN', label: 'Channel access token', secret: true },
    ],
  },
  {
    title: '網站',
    fields: [
      {
        key: 'ADMIN_EMAILS',
        label: '管理員 Email',
        placeholder: 'a@example.com, b@example.com',
        hint: '多個以逗號分隔。會與主機設定的管理員合併,不會把現有管理員鎖在外面。',
      },
      {
        key: 'APPLE_PAY_DOMAIN_ASSOCIATION',
        label: 'Apple Pay 網域驗證檔內容',
        type: 'textarea',
        hint: '藍新開通 Apple Pay 時提供的驗證檔,整份文字貼上。',
      },
    ],
  },
];

export const INTEGRATION_FIELDS = INTEGRATION_GROUPS.flatMap((group) => group.fields);
