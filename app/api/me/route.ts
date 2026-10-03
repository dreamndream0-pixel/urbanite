import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getAdminEmails } from '@/lib/integrations';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/me — 目前登入者資訊,含是否為主管理員(白名單判斷)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });

  const adminEmails = await getAdminEmails();
  const isAdmin = adminEmails.includes((user.email ?? '').toLowerCase());
  const name =
    (user.user_metadata?.name as string) ||
    (user.user_metadata?.full_name as string) ||
    user.email ||
    '';

  const supabase = createAdminClient();
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    email: customer?.email || user.email,
    name: customer?.name || name,
    phone: customer?.phone || user.phone || '',
    address: customer?.address || '',
    recipients: Array.isArray(customer?.recipients) ? customer.recipients : [],
    isAdmin,
  });
}
