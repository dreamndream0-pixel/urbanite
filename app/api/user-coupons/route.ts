import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import type { Discount, UserCoupon } from '@/lib/types';

function isMissingCouponTable(message: string) {
  return /user_coupons|coupon_usages|schema cache|does not exist/i.test(message);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: owned, error: ownedError } = await supabase
    .from('user_coupons')
    .select('*, coupon:discounts(*)')
    .eq('user_id', user.id)
    .order('received_at', { ascending: false });

  if (ownedError) {
    if (isMissingCouponTable(ownedError.message)) {
      return NextResponse.json({ owned: [], claimable: [], ready: false });
    }
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }

  const { data: coupons, error: couponError } = await supabase
    .from('discounts')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (couponError) return NextResponse.json({ error: couponError.message }, { status: 500 });

  const ownedCouponIds = new Set((owned ?? []).map((row) => row.coupon_id as string));
  const claimable = ((coupons ?? []) as Discount[]).filter((coupon) => !ownedCouponIds.has(coupon.id));

  return NextResponse.json({
    owned: (owned ?? []) as UserCoupon[],
    claimable,
    ready: true,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const body = await request.json();
  const couponId = String(body?.coupon_id ?? '').trim();
  if (!couponId) return NextResponse.json({ error: '缺少優惠券' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: coupon, error: couponError } = await supabase
    .from('discounts')
    .select('*')
    .eq('id', couponId)
    .eq('active', true)
    .maybeSingle();

  if (couponError) return NextResponse.json({ error: couponError.message }, { status: 500 });
  if (!coupon) return NextResponse.json({ error: '優惠券不存在或未啟用' }, { status: 404 });

  const expiredAt = coupon.end_at ?? null;
  const { data, error } = await supabase
    .from('user_coupons')
    .upsert(
      {
        user_id: user.id,
        coupon_id: couponId,
        status: 'available',
        expired_at: expiredAt,
      },
      { onConflict: 'user_id,coupon_id' },
    )
    .select('*, coupon:discounts(*)')
    .single();

  if (error) {
    if (isMissingCouponTable(error.message)) {
      return NextResponse.json({ error: '會員優惠券資料表尚未建立,請先執行 supabase/migration-member-coupons.sql' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data as UserCoupon, { status: 201 });
}
