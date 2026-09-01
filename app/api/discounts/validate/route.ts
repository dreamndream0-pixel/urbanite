import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { evaluateCoupon } from '@/lib/discount';
import type { Discount, OrderItem, Product } from '@/lib/types';

// POST /api/discounts/validate — 前台結帳驗證折扣碼(公開)
// body: { code, subtotal } → 回 { discount, code } 或 error
export async function POST(request: Request) {
  const body = await request.json();
  const code = String(body?.code ?? '').trim().toUpperCase();
  const subtotal = Number(body?.subtotal) || 0;
  const shipping = Number(body?.shipping) || 0;
  const items = Array.isArray(body?.items) ? (body.items as OrderItem[]) : [];
  const userCouponId = String(body?.user_coupon_id ?? '').trim();
  if (!code) return NextResponse.json({ error: '請輸入折扣碼' }, { status: 400 });

  const supabase = createAdminClient();
  const user = await getSessionUser();
  const productIds = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))];
  const { data: products } = productIds.length
    ? await supabase.from('products').select('*').in('id', productIds)
    : { data: [] as Product[] };

  const { count: orderCount } = user
    ? await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    : { count: 0 };

  async function usageCounts(couponId: string) {
    const [total, perUser] = await Promise.all([
      supabase.from('coupon_usages').select('id', { count: 'exact', head: true }).eq('coupon_id', couponId),
      user
        ? supabase
            .from('coupon_usages')
            .select('id', { count: 'exact', head: true })
            .eq('coupon_id', couponId)
            .eq('user_id', user.id)
        : Promise.resolve({ count: 0 }),
    ]);
    return { totalUsageCount: total.count ?? 0, userUsageCount: perUser.count ?? 0 };
  }

  if (userCouponId) {
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
    if (!coupon || coupon.code !== code) {
      return NextResponse.json({ error: '優惠券不存在或已停用' }, { status: 400 });
    }
    const counts = await usageCounts(coupon.id);
    const result = evaluateCoupon(coupon, {
      subtotal,
      shipping,
      items,
      products: (products ?? []) as Product[],
      userId: user.id,
      isFirstPurchase: (orderCount ?? 0) === 0,
      userCouponStatus: userCoupon.status,
      ...counts,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? '這張優惠券不可使用' }, { status: 400 });
    return NextResponse.json({
      code: coupon.code,
      discount: result.finalCouponAmount,
      item_discount: result.discount,
      shipping_discount: result.shippingDiscount,
      label: result.label,
      user_coupon_id: userCouponId,
      coupon,
    });
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
  const counts = await usageCounts(d.id);
  const result = evaluateCoupon(d, {
    subtotal,
    shipping,
    items,
    products: (products ?? []) as Product[],
    userId: user?.id ?? null,
    isFirstPurchase: (orderCount ?? 0) === 0,
    ...counts,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason ?? '這張優惠券不可使用' }, { status: 400 });
  return NextResponse.json({
    code: d.code,
    discount: result.finalCouponAmount,
    item_discount: result.discount,
    shipping_discount: result.shippingDiscount,
    label: result.label,
    coupon: d,
  });
}
