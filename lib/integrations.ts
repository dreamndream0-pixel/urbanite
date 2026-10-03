// 後台「串接設定」:金流 / 物流 / LINE 等金鑰存在資料庫(加密),取代每次到 Vercel 設環境變數。
// 只能在伺服器端使用。後台沒填的項目自動沿用環境變數,方便逐步搬移、也不會中斷現有設定。
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { INTEGRATION_FIELDS } from '@/lib/integration-fields';

const ALL_FIELDS = INTEGRATION_FIELDS;
export const INTEGRATION_KEYS = new Set(ALL_FIELDS.map((field) => field.key));

// ---------- 加密 ----------
// 主鑰:優先用 SETTINGS_ENCRYPTION_KEY;未設定時由 Supabase service role key 衍生(不必額外到 Vercel 設定)
function masterKey() {
  const seed = process.env.SETTINGS_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!seed) throw new Error('缺少加密主鑰');
  return crypto.createHash('sha256').update(`urbanite-integrations:${seed}`).digest();
}

function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
}

function decrypt(stored: string) {
  if (!stored.startsWith('v1:')) return '';
  const raw = Buffer.from(stored.slice(3), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

// ---------- 讀取(短暫快取,避免每個請求都查資料庫) ----------
const CACHE_MS = 30_000;
let cache: { at: number; values: Map<string, string> } | null = null;

async function loadStored(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const values = new Map<string, string>();
  try {
    const { data, error } = await createAdminClient().from('integration_settings').select('key,value');
    if (!error) {
      for (const row of data ?? []) {
        try {
          const plain = decrypt(String(row.value ?? ''));
          if (plain) values.set(String(row.key), plain);
        } catch {
          /* 主鑰變更或資料損毀:視為未設定,改用環境變數 */
        }
      }
    }
  } catch {
    /* 資料表尚未建立:全部沿用環境變數 */
  }
  cache = { at: Date.now(), values };
  return values;
}

// 取得設定值:後台設定優先,其次環境變數
export async function getIntegration(key: string): Promise<string> {
  const stored = (await loadStored()).get(key);
  return (stored ?? process.env[key] ?? '').trim();
}

export async function getIntegrations<K extends string>(keys: readonly K[]): Promise<Record<K, string>> {
  const stored = await loadStored();
  return Object.fromEntries(keys.map((key) => [key, (stored.get(key) ?? process.env[key] ?? '').trim()])) as Record<K, string>;
}

// 管理員名單:主機環境變數 ∪ 後台設定
export async function getAdminEmails(): Promise<string[]> {
  const stored = (await loadStored()).get('ADMIN_EMAILS') ?? '';
  const list = `${process.env.ADMIN_EMAILS ?? ''},${stored}`
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

// ---------- 後台用 ----------
export type IntegrationStatus = {
  key: string;
  source: 'admin' | 'env' | 'none';
  value: string; // 非金鑰欄位:實際值;金鑰欄位:遮罩
};

function mask(value: string) {
  if (!value) return '';
  return value.length <= 4 ? '••••' : `••••••${value.slice(-4)}`;
}

export async function listIntegrationStatus(): Promise<IntegrationStatus[]> {
  cache = null;
  const stored = await loadStored();
  return ALL_FIELDS.map((field) => {
    const adminValue = stored.get(field.key);
    const envValue = (process.env[field.key] ?? '').trim();
    const value = adminValue ?? envValue;
    return {
      key: field.key,
      source: adminValue ? 'admin' : envValue ? 'env' : 'none',
      value: field.secret ? mask(value) : value,
    };
  });
}

// 更新設定:空字串 = 刪除(恢復使用環境變數)
export async function saveIntegrations(updates: Record<string, string>) {
  const supabase = createAdminClient();
  const upserts: { key: string; value: string; updated_at: string }[] = [];
  const removals: string[] = [];
  for (const [key, raw] of Object.entries(updates)) {
    if (!INTEGRATION_KEYS.has(key)) continue;
    const value = String(raw ?? '').trim();
    if (value) upserts.push({ key, value: encrypt(value), updated_at: new Date().toISOString() });
    else removals.push(key);
  }
  if (upserts.length) {
    const { error } = await supabase.from('integration_settings').upsert(upserts, { onConflict: 'key' });
    if (error) throw new Error(error.message);
  }
  if (removals.length) {
    const { error } = await supabase.from('integration_settings').delete().in('key', removals);
    if (error) throw new Error(error.message);
  }
  cache = null;
}
