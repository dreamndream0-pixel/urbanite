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
      { user_id: user.id, email: user.email ?? '', name, phone: user.phone ?? '' },
      { onConflict: 'user_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
