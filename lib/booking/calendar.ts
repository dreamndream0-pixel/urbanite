// 預約系統 D4:行事曆
// 匯出:私密 .ics 訂閱(Google / Apple 行事曆訂閱這個網址,單向,不含顧客電話與備註)
// 匯入:讀取外部行事曆的私密 iCal 網址,把忙碌時段當成不開放預約的時間(每 15 分鐘更新)
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, ownerBusiness } from './server';

const db = () => createAdminClient();
export const newToken = () => randomBytes(24).toString('base64url');

// ---------- 匯出 ----------
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// 每行最多 75 bytes(RFC 5545 折行)
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ` ${ch}`; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export async function feedFor(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [{ data: biz }, { data: staff }] = await Promise.all([
    db().from('bk_businesses').select('id, name, address').eq('calendar_token', token).maybeSingle(),
    db().from('bk_staff').select('id, name, business_id').eq('calendar_token', token).maybeSingle(),
  ]);
  const businessId = biz?.id ?? staff?.business_id;
  if (!businessId) return null;
  const { data: business } = biz ? { data: biz } : await db().from('bk_businesses').select('id, name, address').eq('id', businessId).single();
  const from = new Date(Date.now() - 30 * 86400000).toISOString();
  const to = new Date(Date.now() + 120 * 86400000).toISOString();
  let q = db().from('bk_bookings').select('id, booking_no, start_at, end_at, status, service_snapshot, contact, staff_id, branch_id')
    .eq('business_id', businessId).in('status', ['pending', 'confirmed', 'checked_in', 'completed']).gte('start_at', from).lt('start_at', to).order('start_at').limit(2000);
  if (staff) q = q.eq('staff_id', staff.id);
  const [{ data: bookings }, { data: staffList }, { data: branches }] = await Promise.all([
    q,
    db().from('bk_staff').select('id, name').eq('business_id', businessId),
    db().from('bk_branches').select('id, name, address').eq('business_id', businessId),
  ]);
  const name = staff ? `${business?.name ?? ''} · ${staff.name}` : business?.name ?? '預約';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//URBANLINKS//Booking Feed//ZH-TW', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${name} 預約`)}`, 'X-WR-TIMEZONE:Asia/Taipei', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
  ];
  for (const b of bookings ?? []) {
    const who = !staff && (staffList ?? []).length > 1 ? `[${(staffList ?? []).find((s) => s.id === b.staff_id)?.name ?? ''}] ` : '';
    const branch = (branches ?? []).find((x) => x.id === b.branch_id);
    const contact = b.contact as { name?: string };
    lines.push(
      'BEGIN:VEVENT', `UID:${b.id}@urbanlinks`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(b.start_at)}`, `DTEND:${stamp(b.end_at)}`,
      fold(`SUMMARY:${esc(`${b.status === 'pending' ? '(待確認) ' : ''}${who}${(b.service_snapshot as { name: string }).name} · ${contact?.name ?? ''}`)}`),
      ...(branch?.address || business?.address ? [fold(`LOCATION:${esc(branch ? `${branch.name} ${branch.address}` : business?.address ?? '')}`)] : []),
      fold(`DESCRIPTION:${esc(`預約編號 ${b.booking_no}`)}`),
      `STATUS:${b.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

export async function rotateToken(ownerUserId: string, staffId: string | null) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  const token = newToken();
  const q = staffId
    ? db().from('bk_staff').update({ calendar_token: token }).eq('id', staffId).eq('business_id', business.id)
    : db().from('bk_businesses').update({ calendar_token: token }).eq('id', business.id);
  const { error } = await q;
  if (error) throw new BookingError('SERVER_ERROR', '產生網址失敗。', 500);
  return token;
}

// ---------- 匯入 ----------
const ALLOWED_HOSTS = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /(^|\.)icloud\.com$/, /^outlook\.live\.com$/, /^outlook\.office365\.com$/, /^outlook\.office\.com$/];

export function normalizeCalendarUrl(raw: string) {
  const s = raw.trim().replace(/^webcal:\/\//i, 'https://');
  let url: URL;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!ALLOWED_HOSTS.some((re) => re.test(url.hostname))) return null;
  return url.toString();
}

type Ev = { start: number; end: number };

// 解析 iCal 時間:UTC(Z)、TZID(以台灣 +8 處理常見的 Asia/Taipei)、全天(DATE)
function parseTime(value: string, params: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', se = '00', z] = m;
  if (z) return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  const tz = /TZID=([^;:]+)/.exec(params)?.[1] ?? 'Asia/Taipei';
  const offset = /Asia\/(Taipei|Hong_Kong|Shanghai|Singapore)|Australia\/Perth/.test(tz) ? 8 : /Asia\/Tokyo|Asia\/Seoul/.test(tz) ? 9 : 8;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - offset * 3600000;
}

// 基本 RRULE 展開(DAILY / WEEKLY + BYDAY / INTERVAL / COUNT / UNTIL,含 EXDATE),只展開到 windowEnd
function expand(start: number, end: number, rrule: string, exdates: Set<number>, windowEnd: number): Ev[] {
  const rule = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]));
  const len = end - start;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = Number(rule.COUNT) || Infinity;
  const until = rule.UNTIL ? parseTime(rule.UNTIL, '') ?? windowEnd : windowEnd;
  const limit = Math.min(until, windowEnd);
  const out: Ev[] = [];
  const DAY = 86400000;
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((x) => days.indexOf(x.replace(/^[+-]?\d+/, ''))).filter((x) => x >= 0) : [];
  let n = 0;
  if (rule.FREQ === 'DAILY') {
    for (let t = start; t <= limit && n < count && out.length < 500; t += interval * DAY) { n++; if (!exdates.has(t)) out.push({ start: t, end: t + len }); }
  } else if (rule.FREQ === 'WEEKLY') {
    const wd = new Date(start + 8 * 3600000).getUTCDay();
    const targets = byday.length ? byday : [wd];
    const weekStart = start - wd * DAY;
    for (let w = 0; weekStart + w * 7 * DAY <= limit && n < count && out.length < 500; w += interval) {
      for (const td of targets.sort((a, b) => a - b)) {
        const t = weekStart + w * 7 * DAY + td * DAY;
        if (t < start || t > limit || n >= count) continue;
        n++;
        if (!exdates.has(t)) out.push({ start: t, end: t + len });
      }
    }
  } else {
    out.push({ start, end });
  }
  return out;
}

export function parseIcs(text: string, windowStart: number, windowEnd: number): Ev[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out: Ev[] = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const props = new Map<string, { params: string; value: string }[]>();
    for (const line of body.split(/\r?\n/)) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (!m) continue;
      const list = props.get(m[1]) ?? [];
      list.push({ params: m[2], value: m[3] });
      props.set(m[1], list);
    }
    const uid = props.get('UID')?.[0]?.value ?? '';
    if (uid.endsWith('@urbanlinks')) continue;                         // 不要把自己匯出的預約再匯回來
    if (props.get('TRANSP')?.[0]?.value === 'TRANSPARENT') continue;   // 標示「空閒」的活動
    if (props.get('STATUS')?.[0]?.value === 'CANCELLED') continue;
    const ds = props.get('DTSTART')?.[0];
    if (!ds) continue;
    const start = parseTime(ds.value, ds.params);
    if (start === null) continue;
    const de = props.get('DTEND')?.[0];
    let end = de ? parseTime(de.value, de.params) : null;
    if (end === null) end = /VALUE=DATE/.test(ds.params) || ds.value.length === 8 ? start + 86400000 : start + 3600000;
    if (end <= start) continue;
    const ex = new Set<number>();
    for (const e of props.get('EXDATE') ?? []) for (const v of e.value.split(',')) { const t = parseTime(v, e.params); if (t !== null) ex.add(t); }
    const rrule = props.get('RRULE')?.[0]?.value;
    const evs = rrule ? expand(start, end, rrule, ex, windowEnd) : [{ start, end }];
    for (const ev of evs) if (ev.end > windowStart && ev.start < windowEnd) out.push(ev);
    if (out.length > 3000) break;
  }
  return out;
}

export async function syncCalendar(cal: { id: string; business_id: string; staff_id: string | null; url: string }) {
  const windowStart = Date.now() - 86400000;
  const windowEnd = Date.now() + 120 * 86400000;
  try {
    const url = normalizeCalendarUrl(cal.url);
    if (!url) throw new Error('網址不支援');
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/calendar' } });
    if (!res.ok) throw new Error(`讀取失敗(${res.status})`);
    const text = await res.text();
    if (text.length > 3 * 1024 * 1024) throw new Error('行事曆太大');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('不是行事曆格式');
    const events = parseIcs(text, windowStart, windowEnd);
    await db().from('bk_external_busy').delete().eq('calendar_id', cal.id);
    if (events.length) {
      const rows = events.map((e) => ({ calendar_id: cal.id, business_id: cal.business_id, staff_id: cal.staff_id, start_at: new Date(e.start).toISOString(), end_at: new Date(e.end).toISOString() }));
      for (let i = 0; i < rows.length; i += 500) await db().from('bk_external_busy').insert(rows.slice(i, i + 500));
    }
    await db().from('bk_external_calendars').update({ last_synced_at: new Date().toISOString(), last_error: '', event_count: events.length }).eq('id', cal.id);
    return events.length;
  } catch (e) {
    await db().from('bk_external_calendars').update({ last_synced_at: new Date().toISOString(), last_error: (e instanceof Error ? e.message : '讀取失敗').slice(0, 100) }).eq('id', cal.id);
    return -1;
  }
}

// 背景工作:超過 15 分鐘沒更新的外部行事曆重新讀取
export async function syncDueCalendars(limit = 10) {
  const due = new Date(Date.now() - 15 * 60000).toISOString();
  const { data } = await db().from('bk_external_calendars').select('id, business_id, staff_id, url').eq('active', true)
    .or(`last_synced_at.is.null,last_synced_at.lt.${due}`).limit(limit);
  let n = 0;
  for (const cal of data ?? []) if ((await syncCalendar(cal)) >= 0) n++;
  return n;
}

export async function addCalendar(ownerUserId: string, input: { url: string; staffId: string | null; label: string }) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  const url = normalizeCalendarUrl(input.url);
  if (!url) throw new BookingError('VALIDATION_ERROR', '請貼上 Google、iCloud 或 Outlook 行事曆的私密 iCal 網址(.ics)。', 422);
  const { count } = await db().from('bk_external_calendars').select('id', { count: 'exact', head: true }).eq('business_id', business.id);
  if ((count ?? 0) >= 20) throw new BookingError('POLICY_BLOCKED', '最多 20 個外部行事曆。', 422);
  const { data, error } = await db().from('bk_external_calendars').insert({
    business_id: business.id, staff_id: input.staffId || null, url, label: input.label.trim().slice(0, 30),
  }).select('id, business_id, staff_id, url').single();
  if (error) throw new BookingError('SERVER_ERROR', '新增失敗。', 500);
  const n = await syncCalendar(data);
  const { data: row } = await db().from('bk_external_calendars').select('id, staff_id, label, last_synced_at, last_error, event_count').eq('id', data.id).single();
  return { ...row, synced: n };
}

export async function removeCalendar(ownerUserId: string, id: string) {
  const business = await ownerBusiness(ownerUserId);
  await db().from('bk_external_calendars').delete().eq('id', id).eq('business_id', business?.id ?? '');
}
