import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop } from '@/lib/shop';
import { getLoyalty, saveLoyalty } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

async function context() {
  const [admin, shop] = await Promise.all([getAdminUser(), getCurrentShop()]);
  return admin && shop ? { admin, shop } : null;
}

// GET /api/admin/loyalty — 回饋金與等級設定
export async function GET() {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: '未授權' }, { status: 401 });
  return NextResponse.json({ settings: await getLoyalty(ctx.shop.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
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
