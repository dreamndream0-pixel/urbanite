import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import type { Discount, UserCoupon } from '@/lib/types';

function isSchemaMissing(message = '') {
  return /user_coupons|coupon_usages|schema cache|does not exist/i.test(message);
}

function couponActive(coupon: Discount, now = new Date()) {
  if (!coupon.active || (coupon.status && !['啟用', 'active'].includes(coupon.status))) return false;
  if (coupon.start_at && new Date(coupon.start_at) > now) return false;
  if (coupon.end_at && new Date(coupon.end_at) < now) return false;
  return true;
}

function normalizeOwned(row: UserCoupon): UserCoupon {
  const endAt = row.coupon?.end_at ?? row.expired_at ?? null;
  if (row.status === 'available' && endAt && new Date(endAt) < new Date()) {
    return { ...row, status: 'expired' };
  }
  return row;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ owned: [], claimable: [] });

  const supabase = createAdminClient();
  const { data: owned, error: ownedError } = await supabase
    .from('user_coupons')
    .select('*, coupon:discounts(*)')
    .eq('user_id', user.id)
    .order('received_at', { ascending: false });

  if (ownedError) {
    if (isSchemaMissing(ownedError.message)) return NextResponse.json({ owned: [], claimable: [], ready: false });
    return NextResponse.json({ error: ownedError.message }, { status: 500 });
  }

  const { data: coupons, error: couponError } = await supabase
    .from('discounts')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (couponError) return NextResponse.json({ error: couponError.message }, { status: 500 });

  const normalizedOwned = ((owned ?? []) as UserCoupon[]).map(normalizeOwned);
  const ownedCouponIds = new Set(normalizedOwned.map((row) => row.coupon_id));
  const activeCoupons = ((coupons ?? []) as Discount[]).filter((coupon) => couponActive(coupon));

  const claimable: Discount[] = [];
  for (const coupon of activeCoupons) {
    if (ownedCouponIds.has(coupon.id)) continue;
    if (coupon.total_limit) {
      const { count } = await supabase
        .from('user_coupons')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id);
      if ((count ?? 0) >= coupon.total_limit) continue;
    }
    claimable.push(coupon);
  }

  return NextResponse.json({
    owned: normalizedOwned,
    available: normalizedOwned.filter((row) => row.status === 'available'),
    used: normalizedOwned.filter((row) => row.status === 'used'),
    expired: normalizedOwned.filter((row) => row.status === 'expired'),
    revoked: normalizedOwned.filter((row) => row.status === 'revoked'),
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
    .maybeSingle();

  if (couponError) return NextResponse.json({ error: couponError.message }, { status: 500 });
  if (!coupon || !couponActive(coupon as Discount)) {
    return NextResponse.json({ error: '優惠券不存在、未啟用或已過期' }, { status: 404 });
  }

  const d = coupon as Discount;
  if (d.total_limit) {
    const { count } = await supabase
      .from('user_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', d.id);
    if ((count ?? 0) >= d.total_limit) return NextResponse.json({ error: '優惠券已領完' }, { status: 409 });
  }

  const expiredAt = d.end_at ?? null;
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
    if (isSchemaMissing(error.message)) {
      return NextResponse.json({ error: '會員優惠券資料表尚未建立,請先執行優惠券資料庫遷移' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data as UserCoupon, { status: 201 });
}
