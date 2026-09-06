// 後台的 <input type="datetime-local"> 給出的值(例:"2026-09-07T00:00")不含時區資訊,
// 代表的是店家所在的台灣當地時間(UTC+8)。若原封不動存進資料庫,常會被解讀成 UTC,
// 導致實際生效時間比店家設定的晚了 8 小時(優惠券「明明已經開始卻顯示尚未開始」的成因)。
// 這兩個函式讓「datetime-local 輸入值 ⇄ 資料庫時間戳」的轉換在存/讀兩端都明確標記 +08:00。

const TAIPEI_OFFSET_MS = 8 * 3600 * 1000;

// 寫入資料庫前:把 datetime-local 的原始值明確標記為台灣時間(+08:00)。
// 若字串已含時區資訊(Z 或 ±hh:mm)則原樣保留,不重複附加。
export function taipeiInputToISO(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  const withSeconds = s.length === 16 ? `${s}:00` : s; // "YYYY-MM-DDTHH:mm" → 補秒
  return `${withSeconds}+08:00`;
}

// 顯示於 datetime-local 輸入框前:把資料庫存的時間戳(UTC)換算回台灣當地時間的
// "YYYY-MM-DDTHH:mm",避免編輯既有優惠券時開始/結束時間跳掉 8 小時。
export function isoToTaipeiInput(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date(d.getTime() + TAIPEI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
