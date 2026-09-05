import crypto from 'crypto';
import { aesEncrypt, tradeSha, verifyTradeSha } from '@/lib/newebpay';
import { getConfiguredSiteUrl } from '@/lib/site-url';

// 解密藍新物流回傳:比照官方範例(OPENSSL_ZERO_PADDING + 自行去 padding),
// 不用 Node 預設 PKCS7 自動去 padding,避免回傳非標準 padding 時 bad decrypt。
function logisticsAesDecrypt(hex: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
  decipher.setAutoPadding(false);
  const out = Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()]);
  let end = out.length;
  const last = out[end - 1];
  if (last > 0 && last <= 16 && end - last >= 0) end -= last; // 去 PKCS7 padding
  // 再保險:去掉尾端 NUL / 控制字元(zero padding)
  while (end > 0 && out[end - 1] < 0x20) end -= 1;
  return out.subarray(0, end).toString('utf8');
}

const LOGISTIC_PATHS = {
  storeMap: 'storeMap',
  createShipment: 'createShipment',
  getShipmentNo: 'getShipmentNo',
  printLabel: 'printLabel',
  queryShipment: 'queryShipment',
  modifyShipment: 'modifyShipment',
  trace: 'trace',
} as const;

export type NewebpayLogisticsAction = keyof typeof LOGISTIC_PATHS;

export function getNewebpayLogisticsConfig() {
  const env = (process.env.NEWEBPAY_LOGISTICS_ENV || 'stage').toLowerCase();
  const isProd = env === 'production' || env === 'prod';
  return {
    uid: process.env.NEWEBPAY_LOGISTICS_UID || '',
    hashKey: process.env.NEWEBPAY_LOGISTICS_HASH_KEY || '',
    hashIv: process.env.NEWEBPAY_LOGISTICS_HASH_IV || '',
    apiBase: isProd ? 'https://core.newebpay.com/API/Logistic' : 'https://ccore.newebpay.com/API/Logistic',
    siteUrl: getConfiguredSiteUrl(),
  };
}

function requireLogisticsConfig() {
  const cfg = getNewebpayLogisticsConfig();
  if (!cfg.uid || !cfg.hashKey || !cfg.hashIv) {
    throw new Error('缺少藍新物流設定，請設定 NEWEBPAY_LOGISTICS_UID、NEWEBPAY_LOGISTICS_HASH_KEY、NEWEBPAY_LOGISTICS_HASH_IV');
  }
  return cfg;
}

function parsePayload(plain: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(plain);
    return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch {
    return Object.fromEntries(new URLSearchParams(plain));
  }
}

export function decodeNewebpayLogisticsResponse(form: Record<string, FormDataEntryValue | string>) {
  const cfg = requireLogisticsConfig();
  const encrypted = String(form.EncryptData_ ?? form.EncryptData ?? '');
  const receivedHash = String(form.HashData_ ?? form.HashData ?? '');
  if (!encrypted) throw new Error('缺少藍新物流回傳資料');
  if (receivedHash && !verifyTradeSha(encrypted, receivedHash, cfg.hashKey, cfg.hashIv)) {
    throw new Error('藍新物流回傳驗證失敗');
  }
  return parsePayload(logisticsAesDecrypt(encrypted, cfg.hashKey, cfg.hashIv));
}

export function buildNewebpayLogisticsForm(
  action: NewebpayLogisticsAction,
  data: Record<string, string | number | string[] | undefined | null>,
) {
  const cfg = requireLogisticsConfig();
  // 藍新物流規格:EncryptData 明文為「JSON 字串」(非金流的 query string),
  // 再 AES-256-CBC → hex,雜湊 = SHA256(HashKey=..&<enc>&HashIV=..) 轉大寫。
  // 陣列值(如 getShipmentNo / printLabel 的 MerchantOrderNo)需保留為 JSON 陣列。
  const payload: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    payload[key] = Array.isArray(value) ? value : String(value);
  }
  if (!payload.TimeStamp) payload.TimeStamp = String(Math.floor(Date.now() / 1000));
  payload.Version = '1.0';
  payload.RespondType = 'JSON';
  const encryptData = aesEncrypt(JSON.stringify(payload), cfg.hashKey, cfg.hashIv);
  return {
    actionUrl: `${cfg.apiBase}/${LOGISTIC_PATHS[action]}`,
    fields: {
      UID_: cfg.uid,
      EncryptData_: encryptData,
      HashData_: tradeSha(encryptData, cfg.hashKey, cfg.hashIv),
      Version_: '1.0',
      RespondType_: 'JSON',
    },
  };
}

export async function requestNewebpayLogistics(
  action: NewebpayLogisticsAction,
  data: Record<string, string | number | string[] | undefined | null>,
) {
  const form = buildNewebpayLogisticsForm(action, data);
  const res = await fetch(form.actionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form.fields).toString(),
  });
  const rawText = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(rawText);
  } catch {
    raw = { body: rawText };
  }
  const encrypted = String(raw.EncryptData ?? raw.EncryptData_ ?? '');
  const hash = String(raw.HashData ?? raw.HashData_ ?? '');
  const dataPayload = encrypted ? decodeNewebpayLogisticsResponse({ EncryptData: encrypted, HashData: hash }) : null;
  // 藍新物流成功外層 Status 固定為 SUCCESS;其餘(1102/1109/2100…)皆為失敗。
  return {
    ok: res.ok && String(raw.Status ?? '').toUpperCase() === 'SUCCESS',
    status: String(raw.Status ?? ''),
    message: String(raw.Message ?? ''),
    raw,
    data: dataPayload,
  };
}

// 從 getShipmentNo 回應取出寄件代碼:優先 SUCCESS[] 內的 LgsNo/StorePrintNo,
// 若落在 ERROR[] 則回傳錯誤訊息。
export function parseShipmentNo(payload: Record<string, unknown> | null): {
  lgsNo: string;
  storePrintNo: string;
  error: string;
} {
  const success = payload?.SUCCESS;
  const rows = Array.isArray(success) ? success : success && typeof success === 'object' ? [success] : [];
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  const lgsNo = String(row.LgsNo ?? '');
  const storePrintNo = String(row.StorePrintNo ?? '');
  if (lgsNo || storePrintNo) return { lgsNo, storePrintNo, error: '' };
  const errArr = payload?.ERROR;
  const errRows = Array.isArray(errArr) ? errArr : errArr && typeof errArr === 'object' ? [errArr] : [];
  const errRow = (errRows[0] ?? {}) as Record<string, unknown>;
  const error = String(errRow.ErrorCode ?? errRow.Message ?? '') || (errRows.length ? '取號失敗' : '');
  return { lgsNo, storePrintNo, error };
}

// 建單後藍新資料可能尚未同步,取號 1109 時短暫重試
export async function getShipmentNoWithRetry(orderNo: string, tries = 3, delayMs = 1500) {
  let last: Awaited<ReturnType<typeof requestNewebpayLogistics>> | null = null;
  for (let i = 0; i < tries; i += 1) {
    last = await requestNewebpayLogistics('getShipmentNo', { MerchantOrderNo: [orderNo] });
    if (last.ok) return last;
    if (last.status !== '1109') return last; // 非「查無物流訂單」就不重試
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

export function isStorePickup(method = ''): boolean {
  return /超商|取貨|7-?11|7-ELEVEN|全家|family|萊爾富|hi-?life|ok/i.test(method);
}

export function shipTypeFromMethod(method = ''): string {
  if (/全家|family/i.test(method)) return '2';
  if (/萊爾富|hi-?life/i.test(method)) return '3';
  if (/\bok\b|ok mart/i.test(method)) return '4';
  return '1';
}

export function shipTypeName(code = ''): string {
  if (code === '2') return '全家';
  if (code === '3') return '萊爾富';
  if (code === '4') return 'OK mart';
  return '7-ELEVEN';
}

export function tradeTypeFromPayment(paymentMethod = ''): string {
  return /取貨付款|貨到付款|cod/i.test(paymentMethod) ? '1' : '3';
}

// TradeType:1=取貨付款(藍新代收貨款)、3=取貨不付款(客人已線上付款,到店純取貨)。
// 這 4 種超商方式的「付款/不付款」寫在物流方式名稱裡,故以物流名稱為主,付款方式為後備。
export function tradeTypeFromMethod(shippingMethod = '', paymentMethod = ''): string {
  if (/不付款|不代收/.test(shippingMethod)) return '3';
  if (/取貨付款|貨到付款|cod/i.test(shippingMethod)) return '1';
  return tradeTypeFromPayment(paymentMethod);
}

export function normalizeLogisticsPhone(phone = ''): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('886')) return `0${digits.slice(3)}`.slice(0, 10);
  return digits.slice(0, 10);
}

// 依藍新官方貨態代碼表(RetId → RetString)對應到本站物流狀態。
// 官方代碼表(超商 C2C):
//   0_1 訂單未處理 / 0_2 物流單號已過期 / 0_3 取消出貨 / 1 訂單處理中 → 待出貨(尚未進物流)
//   2 超商已收件 / 3 已重選門市待重新出貨 / 4 進物流中心驗收完成 / 11 取貨門市關店待重選 → 運送中
//   5 商品送達取貨門市 → 待取貨
//   6 買家取貨完成 → 已取貨(超商)/ 已送達(宅配)
//   -1 已退回廠商 / -7 判賠 / -10、-11、15 銷毀拋棄 → 已退回(終結)
//   其餘負數與 10/12/13/14/16(退回途中、待確認匯款…) → 退貨處理中
export function retToFulfillmentStatus(
  retId: unknown,
  opts: { description?: string; isPickup?: boolean } = {},
): string {
  const id = String(retId ?? '').trim();
  if (id) {
    if (id.startsWith('0') || id === '1') return 'READY_TO_SHIP';   // 待處理 / 處理中
    if (['2', '3', '4', '11'].includes(id)) return 'IN_TRANSIT';    // 運送中
    if (id === '5') return 'AT_STORE';                              // 送達取貨門市 → 待取貨
    if (id === '6') return opts.isPickup ? 'PICKED_UP' : 'DELIVERED'; // 取貨完成
    if (['-1', '-7', '-10', '-11', '15'].includes(id)) return 'RETURNED'; // 退回廠商/判賠/銷毀
    if (id.startsWith('-') || ['10', '12', '13', '14', '16'].includes(id)) return 'RETURNING';
  }
  // 代碼缺失時以描述文字輔助判斷
  const text = String(opts.description ?? '');
  const returnedText = /退回|退貨|逾期(未取|退)|未取.*退|退件|銷毀|判賠/.test(text);
  const pickedUpText = /取貨完成|取件完成|已取貨/.test(text);
  const arrivedAtStore = !returnedText && !pickedUpText && (
    /到店|到門市|貨到門市|可取(件|貨)|待取貨?|取件通知/.test(text)
    || (/門市/.test(text) && /(到達|送達|配達|抵達|到店|可取|取件|待取)/.test(text))
  );
  if (opts.isPickup && pickedUpText) return 'PICKED_UP';
  if (opts.isPickup && arrivedAtStore) return 'AT_STORE';
  if (returnedText) return 'RETURNING';
  return 'READY_TO_SHIP';
}
