import { aesDecrypt, aesEncrypt, tradeSha, verifyTradeSha } from '@/lib/newebpay';
import { getConfiguredSiteUrl } from '@/lib/site-url';

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
  return parsePayload(aesDecrypt(encrypted, cfg.hashKey, cfg.hashIv));
}

export function buildNewebpayLogisticsForm(
  action: NewebpayLogisticsAction,
  data: Record<string, string | number | undefined | null>,
) {
  const cfg = requireLogisticsConfig();
  // 藍新物流規格:EncryptData 明文為「JSON 字串」(非金流的 query string),
  // 再 AES-256-CBC → hex,雜湊 = SHA256(HashKey=..&<enc>&HashIV=..) 轉大寫。
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) payload[key] = String(value);
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
  data: Record<string, string | number | undefined | null>,
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
  return {
    ok: res.ok && String(raw.Status ?? '').toUpperCase() !== 'ERROR',
    status: String(raw.Status ?? ''),
    message: String(raw.Message ?? ''),
    raw,
    data: dataPayload,
  };
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

export function normalizeLogisticsPhone(phone = ''): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('886')) return `0${digits.slice(3)}`.slice(0, 10);
  return digits.slice(0, 10);
}

export function retToFulfillmentStatus(retId: unknown): string {
  const id = String(retId ?? '');
  if (id === '6') return 'DELIVERED';
  if (['2', '3', '4', '5'].includes(id)) return 'IN_TRANSIT';
  if (id.startsWith('-') || ['10', '12', '13', '14', '15', '16'].includes(id)) return 'RETURNING';
  return 'READY_TO_SHIP';
}
