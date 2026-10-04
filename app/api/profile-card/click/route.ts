import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// POST /api/profile-card/click { block_id } — 前台點擊計數(只記次數,不記個資)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const blockId = String(body?.block_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(blockId)) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = createAdminClient();
  const { data } = await supabase.from('profile_card_blocks').select('clicks').eq('id', blockId).maybeSingle();
  if (data) await supabase.from('profile_card_blocks').update({ clicks: (data.clicks ?? 0) + 1 }).eq('id', blockId);
  return NextResponse.json({ ok: true });
}
