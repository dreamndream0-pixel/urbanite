import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, scopedClient } from '@/lib/shop';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLoyalty, saveLoyalty } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

async function context() {
  const [admin, shop] = await Promise.all([getAdminUser(), getCurrentShop()]);
  return admin && shop ? { admin, shop } : null;
}

async function previewOwnerName(ctx: NonNullable<Awaited<ReturnType<typeof context>>>) {
  const ownerId = ctx.shop.owner_user_id || (isPlatformShop(ctx.shop) ? ctx.admin.id : null);
  const fallback = ctx.shop.name || '店主';
  if (!ownerId) return fallback;
  try {
    const { data: customer } = await scopedClient(ctx.shop.id).from('customers').select('name').eq('user_id', ownerId).maybeSingle();
    if (typeof customer?.name === 'string' && customer.name.trim()) return customer.name.trim().slice(0, 80);
    const owner = ownerId === ctx.admin.id ? ctx.admin : (await createAdminClient().auth.admin.getUserById(ownerId)).data.user;
    const name = [owner?.user_metadata?.name, owner?.user_metadata?.full_name].find((value) => typeof value === 'string' && value.trim());
    return name ? String(name).trim().slice(0, 80) : fallback;
  } catch { return fallback; }
}

// GET /api/admin/loyalty — 回饋金與等級設定
export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const [settings, ownerName] = await Promise.all([getLoyalty(ctx.shop.id), previewOwnerName(ctx)]);
  return NextResponse.json({ settings, ownerName }, { headers: { 'Cache-Control': 'private, no-store' } });
}

// PUT /api/admin/loyalty { settings }
export async function PUT(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json({ settings: await saveLoyalty(ctx.shop.id, body.settings) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '儲存失敗' }, { status: 400 });
  }
}
