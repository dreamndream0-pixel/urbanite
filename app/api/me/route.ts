import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';

// GET /api/me — 目前登入者資訊,含是否為主管理員(白名單判斷)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.includes((user.email ?? '').toLowerCase());
  const name =
    (user.user_metadata?.name as string) ||
    (user.user_metadata?.full_name as string) ||
    user.email ||
    '';

  return NextResponse.json({ email: user.email, name, isAdmin });
}
