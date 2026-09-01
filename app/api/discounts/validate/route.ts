import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { calcDiscount } from '@/lib/discount';
import type { Discount } from '@/lib/types';

// POST /api/discounts/validate — 前台結帳驗證折扣碼(公開)
// body: { code, subtotal } → 回 { discount, code } 或 error
export async function POST(request: Request) {
  const body = await request.json();
  const code = String(body?.code ?? '').trim().toUpperCase();
  const subtotal = Number(body?.subtotal) || 0;
  const userCouponId = String(body?.user_coupon_id ?? '').trim();
  if (!code) return NextResponse.json({ error: '請輸入折扣碼' }, { status: 400 });

  const supabase = createAdminClient();
  if (userCouponId) {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '請先登入才能使用會員優惠券' }, { status: 401 });
    const { data: userCoupon, error: userCouponError } = await supabase
      .from('user_coupons')
      .select('*, coupon:discounts(*)')
      .eq('id', userCouponId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (userCouponError) return NextResponse.json({ error: userCouponError.message }, { status: 500 });
    if (!userCoupon || userCoupon.status !== 'available') {
      return NextResponse.json({ error: '這張會員優惠券不可使用' }, { status: 400 });
    }
    const coupon = userCoupon.coupon as Discount | null;
    if (!coupon || coupon.code !== code || !coupon.active) {
      return NextResponse.json({ error: '優惠券不存在或已停用' }, { status: 400 });
    }
    if (subtotal < coupon.min_spend) {
      return NextResponse.json({ error: `需消費滿 ${coupon.min_spend} 元才能使用` }, { status: 400 });
    }
    const discount = calcDiscount(coupon, subtotal);
    return NextResponse.json({ code: coupon.code, discount, user_coupon_id: userCouponId });
  }

  const { data, error } = await supabase
    .from('discounts')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '折扣碼無效或已停用' }, { status: 404 });

  const d = data as Discount;
  if (subtotal < d.min_spend) {
    return NextResponse.json(
      { error: `需消費滿 ${d.min_spend} 元才能使用` },
      { status: 400 },
    );
  }

  const discount = calcDiscount(d, subtotal);
  return NextResponse.json({ code: d.code, discount });
}
