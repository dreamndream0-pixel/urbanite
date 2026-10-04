import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { getFollowerCount } from '@/lib/line-bot';
import { BUILTIN_LABELS, type BuiltinKey } from '@/lib/line-bot-types';

export const dynamic = 'force-dynamic';

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(iso));

// 點擊來源的易讀名稱
function clickLabel(key: string, rules: Map<string, string>) {
  const [kind, id, ...rest] = key.split(':');
  if (kind === 'rule') return `自動回覆:${rules.get(id) ?? '已刪除的規則'}`;
  if (kind === 'welcome') return id === 'member' ? '歡迎訊息(會員)' : '歡迎訊息(非會員)';
  if (kind === 'menu') return `圖文選單:${id === 'member' ? '會員' : '非會員'}第 ${Number(rest[0] ?? 0) + 1} 格`;
  if (kind === 'broadcast') return '推播訊息';
  if (kind === 'notify') return '訂單通知:查看訂單';
  if (kind === 'default') return '預設回覆';
  return key;
}

// GET /api/admin/line-bot/stats?days=30
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const days = Math.min(90, Math.max(7, Number(new URL(request.url).searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const supabase = createAdminClient();
  const [{ data: events }, { data: rules }, { count: bound }, { count: members }, followers] = await Promise.all([
    supabase.from('line_events').select('type, key, created_at').gte('created_at', since).order('created_at').limit(50000),
    supabase.from('line_bot_rules').select('id, name, keywords, hits'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).not('line_user_id', 'is', null),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    getFollowerCount(),
  ]);
  const ruleNames = new Map((rules ?? []).map((r) => [r.id as string, (r.name as string) || (r.keywords as string[])?.[0] || '未命名規則']));
  const list = events ?? [];
  const count = (type: string) => list.filter((e) => e.type === type).length;

  // 每日:加好友 / 封鎖 / 收到訊息
  const daily = new Map<string, { day: string; follow: number; unfollow: number; message: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = dayKey(new Date(Date.now() - i * 24 * 3600 * 1000).toISOString());
    daily.set(d, { day: d, follow: 0, unfollow: 0, message: 0 });
  }
  for (const e of list) {
    const row = daily.get(dayKey(e.created_at));
    if (row && (e.type === 'follow' || e.type === 'unfollow' || e.type === 'message')) row[e.type as 'follow' | 'unfollow' | 'message']++;
  }

  const tally = (type: string, label: (k: string) => string) => {
    const m = new Map<string, number>();
    for (const e of list) if (e.type === type) m.set(e.key, (m.get(e.key) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => ({ key: k, label: label(k), count: n })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  return NextResponse.json({
    days,
    totals: {
      follow: count('follow'),
      unfollow: count('unfollow'),
      message: count('message'),
      click: count('click'),
      notify: count('notify'),
      broadcast: count('broadcast'),
      bound: bound ?? 0,
      members: members ?? 0,
      followers: followers?.followers ?? null,
      blocks: followers?.blocks ?? null,
    },
    daily: [...daily.values()],
    rules: tally('rule', (k) => ruleNames.get(k) ?? '已刪除的規則'),
    builtins: tally('builtin', (k) => BUILTIN_LABELS[k as BuiltinKey]?.label ?? k),
    clicks: tally('click', (k) => clickLabel(k, ruleNames)),
  });
}
