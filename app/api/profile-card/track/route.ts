import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SOURCE_LABELS } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

// POST /api/profile-card/track { card_id, block_id?, type: 'view' | 'click', source }
// 前台瀏覽 / 點擊計數(只記次數與來源,不記個資)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const cardId = String(body?.card_id ?? '');
  const blockId = body?.block_id ? String(body.block_id) : null;
  const type = body?.type === 'click' ? 'click' : body?.type === 'view' ? 'view' : '';
  const source = typeof body?.source === 'string' && body.source in SOURCE_LABELS ? body.source : 'direct';
  if (!UUID.test(cardId) || !type || (blockId && !UUID.test(blockId))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const supabase = createAdminClient();
  await supabase.from('profile_card_events').insert({ card_id: cardId, block_id: type === 'click' ? blockId : null, type, source });
  if (type === 'click' && blockId) {
    const { data } = await supabase.from('profile_card_blocks').select('clicks').eq('id', blockId).eq('card_id', cardId).maybeSingle();
    if (data) await supabase.from('profile_card_blocks').update({ clicks: (data.clicks ?? 0) + 1 }).eq('id', blockId);
  }
  return NextResponse.json({ ok: true });
}
