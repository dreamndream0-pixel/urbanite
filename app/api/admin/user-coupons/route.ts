import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { UserCoupon } from '@/lib/types';

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  const userId = String(body?.user_id ?? '').trim();
  const couponId = String(body?.coupon_id ?? '').trim();
  if (!userId || !couponId) return NextResponse.json({ error: '缺少會員或優惠券' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: coupon } = await supabase.from('discounts').select('end_at').eq('id', couponId).maybeSingle();
  const { data, error } = await supabase
    .from('user_coupons')
    .upsert(
      {
        user_id: userId,
        coupon_id: couponId,
        status: 'available',
        expired_at: coupon?.end_at ?? null,
        used_at: null,
        order_id: null,
        locked_at: null,
        lock_expires_at: null,
      },
      { onConflict: 'user_id,coupon_id' },
    )
    .select('*, coupon:discounts(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as UserCoupon, { status: 201 });
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  const id = String(body?.id ?? '').trim();
  if (!id) return NextResponse.json({ error: '缺少會員優惠券' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: current, error: readError } = await supabase
    .from('user_coupons')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: '找不到會員優惠券' }, { status: 404 });
  if (current.status !== 'available') return NextResponse.json({ error: '只能撤回尚未使用的優惠券' }, { status: 400 });

  const { data, error } = await supabase
    .from('user_coupons')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, coupon:discounts(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as UserCoupon);
}
