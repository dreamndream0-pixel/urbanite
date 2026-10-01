import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Campaign } from '@/lib/types';

const editable: (keyof Campaign)[] = [
  'name', 'slug', 'eyebrow', 'title', 'description', 'hero_image',
  'status', 'start_at', 'end_at', 'theme_color',
];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of editable) if (key in body) update[key] = body[key] || (key === 'start_at' || key === 'end_at' ? null : body[key]);
  if (typeof update.slug === 'string' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(update.slug)) {
    return NextResponse.json({ error: '網址只能使用小寫英文、數字與連字號' }, { status: 400 });
  }
  const { data, error } = await createAdminClient().from('campaigns').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Campaign);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const { error } = await createAdminClient().from('campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
