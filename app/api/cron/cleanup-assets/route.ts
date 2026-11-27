import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/cleanup-assets — 每週刪除換圖後留下、已無任何資料引用的店家舊圖片（上傳滿 7 天才算）。
// 由 Vercel Cron 呼叫；必須設定 CRON_SECRET 並帶 Bearer 授權。判斷規則見 supabase/migration-unused-assets.sql。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'scheduler unavailable' }, { status: 503 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc('unreferenced_store_assets', { min_age: '7 days' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { name: string; bytes: number | null }[];
  let removed = 0, bytes = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { data: gone, error: removeError } = await db.storage.from('assets').remove(batch.map((r) => r.name));
    if (removeError) return NextResponse.json({ error: removeError.message, removed }, { status: 500 });
    const names = new Set((gone ?? []).map((g) => g.name));
    for (const r of batch) if (names.has(r.name)) { removed++; bytes += Number(r.bytes ?? 0); }
  }
  return NextResponse.json({ ok: true, found: rows.length, removed, mb: Math.round(bytes / 10485.76) / 100 });
}
