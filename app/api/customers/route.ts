import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

// POST /api/customers — 把目前登入者寫進顧客系統(註冊/登入後呼叫,重複呼叫安全)
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  // 管理員帳號不建成顧客
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.includes((user.email ?? '').toLowerCase())) {
    return NextResponse.json({ ok: true, skipped: 'admin' });
  }

  const name =
    (user.user_metadata?.name as string) ||
    (user.user_metadata?.full_name as string) ||
    user.email ||
    user.phone ||
    '';

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('customers')
    .upsert(
      { user_id: user.id, email: user.email ?? '', name, phone: user.phone ?? '', address: '' },
      { onConflict: 'user_id' },
    );

  if (error && /address|schema cache/i.test(error.message)) {
    const retry = await supabase
      .from('customers')
      .upsert(
        { user_id: user.id, email: user.email ?? '', name, phone: user.phone ?? '' },
        { onConflict: 'user_id' },
      );
    if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/customers — 會員在會員中心更新自己的姓名 / 手機
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const body = await request.json();
  const update: Record<string, unknown> = { user_id: user.id, email: user.email ?? '' };
  if (typeof body.name === 'string') update.name = body.name.trim();
  if (typeof body.phone === 'string') update.phone = body.phone.trim();
  if (typeof body.address === 'string') update.address = body.address.trim();
  if (typeof body.nickname === 'string') update.nickname = body.nickname.trim();
  if (typeof body.gender === 'string') update.gender = body.gender;
  if (typeof body.birthday === 'string') update.birthday = body.birthday || null;
  if (Array.isArray(body.recipients)) update.recipients = body.recipients;
  if (body.marketing && typeof body.marketing === 'object') update.marketing = body.marketing;
  if (body.privacy && typeof body.privacy === 'object') update.privacy = body.privacy;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('customers')
    .upsert(update, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
