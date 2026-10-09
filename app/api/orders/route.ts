import { NextResponse } from 'next/server';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { evaluateCoupon } from '@/lib/discount';
import { isStorePickup, shipTypeFromMethod } from '@/lib/newebpay-logistics';
import { deriveStatuses } from '@/lib/order-status';
import { initialOrderStatus } from '@/lib/payment';
import { createOrderAccessToken, orderAccessCookieName, ORDER_ACCESS_MAX_AGE } from '@/lib/order-access-token';
import { computeShipping, resolveMethodFee } from '@/lib/shipping';
import { isCampaignLive } from '@/lib/campaign';
import type { Campaign, Discount, Order, OrderItem, Product, Shipment } from '@/lib/types';
import { getCurrentShop, isPlatformShop, shopAdminClient } from '@/lib/shop';
import { isCollectOnDelivery, isOnlinePayment } from '@/lib/payment';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/orders — 取得所有訂單(限管理員)
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const supabase = (await shopAdminClient());
  const [{ data, error }, { data: shipments }] = await Promise.all([
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('shipments').select('*').order('created_at', { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const latest = new Map<string, Shipment>();
  for (const shipment of (shipments ?? []) as Shipment[]) {
    if (!latest.has(shipment.order_id)) latest.set(shipment.order_id, shipment);
  }
  const orders = ((data ?? []) as Order[]).map((order) => {
    const shipment = latest.get(order.id);
    return shipment ? {
      ...order,
      shipment_id: shipment.id,
      shipment_provider: shipment.provider ?? '',
      shipment_code: shipment.store_print_no || shipment.tracking_number || '',
      shipment_store_name: shipment.store_name ?? '',
      shipment_store_id: shipment.store_id ?? '',
    } : order;
  });
  return NextResponse.json(orders);
}

// POST /api/orders — 前台下單(公開)
// 前端只送 { customer_name, email, items:[{ productId, variant, quantity }] }
// 價格與金額全部由後端依資料庫重新計算,避免竄改。
export async function POST(request: Request) {
  const body = await request.json();
  const { customer_name, email, items } = body ?? {};
  const shippingMethod = String(body?.shipping_method ?? '').trim();
  const paymentMethod = String(body?.payment_method ?? '').trim();
  const phone = String(body?.phone ?? '').trim();
  const address = String(body?.address ?? '').trim();
  const note = String(body?.note ?? '').trim();
  const pickupStore = {
    store_id: String(body?.store_id ?? '').trim(),
    store_name: String(body?.store_name ?? '').trim(),
    store_phone: String(body?.store_phone ?? '').trim(),
    store_address: String(body?.store_address ?? '').trim(),
    store_ship_type: String(body?.store_ship_type ?? '').trim() || shipTypeFromMethod(shippingMethod),
    store_lgs_type: String(body?.store_lgs_type ?? '').trim() || 'C2C',
  };

  if (!customer_name || !email) {
    return NextResponse.json({ error: '請填寫姓名與 Email' }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: '購物車是空的' }, { status: 400 });
  }
  if (!shippingMethod || !paymentMethod) {
    return NextResponse.json({ error: '請選擇付款與送貨方式' }, { status: 400 });
  }
  // 其他店家(U Pro):只能用這家店開啟的付款 / 寄送方式;不能用線上金流與「取貨付款」(需要藍新代收,是 URBANITE 的帳號)
  // 「超商取貨不付款」可以:買家自己填門市,店家自己寄(例如賣貨便),手動填物流單號
  const platformShop = isPlatformShop(await getCurrentShop());
  if (!platformShop) {
    const { data: shopSettings } = await (await shopAdminClient()).from('site_settings').select('enabled_payment_methods, enabled_shipping_methods').maybeSingle();
    const pays = ((shopSettings?.enabled_payment_methods as string[] | null) ?? ['轉帳匯款']).filter((m) => !isOnlinePayment(m));
    const ships = ((shopSettings?.enabled_shipping_methods as string[] | null) ?? ['宅配到府']).filter((m) => !(isStorePickup(m) && isCollectOnDelivery(m, '')));
    if (!pays.includes(paymentMethod) || !ships.includes(shippingMethod)) {
      return NextResponse.json({ error: '這家店只提供轉帳匯款,配送可選宅配或超商取貨不付款' }, { status: 400 });
    }
  }
  if (!platformShop && isStorePickup(shippingMethod)) {
    pickupStore.store_lgs_type = 'MANUAL'; // 店家自己寄,不建藍新物流單
    if (!pickupStore.store_name) return NextResponse.json({ error: '請填寫取貨門市名稱' }, { status: 400 });
    if (!pickupStore.store_id) pickupStore.store_id = 'MANUAL';
  }
  if (isStorePickup(shippingMethod) && !pickupStore.store_id) {
    return NextResponse.json({ error: '請先選擇超商取貨門市' }, { status: 400 });
  }

  const supabase = (await shopAdminClient());

  // 一次查出所有相關商品
  const productIds = [...new Set(items.map((i) => String(i.productId)))] as string[];
  const { data: productRows, error: prodErr } = await supabase.from('products').select('*').in('id', productIds);
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });
  // 活動頁商品只有在活動開放期間可以下單
  const campaignIds = [...new Set(((productRows ?? []) as Product[]).map((p) => p.campaign_id).filter(Boolean))] as string[];
  const { data: campaignRows } = campaignIds.length
    ? await supabase.from('campaigns').select('id,status,start_at,end_at').in('id', campaignIds)
    : { data: [] as Campaign[] };
  const liveCampaigns = new Set(((campaignRows ?? []) as Campaign[]).filter((c) => isCampaignLive(c)).map((c) => c.id));
  const products = ((productRows ?? []) as Product[]).filter((p) => !p.campaign_id || liveCampaigns.has(p.campaign_id));
  const priceMap = new Map(products.map((p) => [p.id, p]));
  const user = await getSessionUser();

  // 依資料庫價格組出明細並計算金額
  const orderItems: OrderItem[] = [];
  let subtotal = 0;
  for (const item of items) {
    const product = priceMap.get(String(item.productId));
    if (!product) {
      return NextResponse.json({ error: `找不到商品:${item.productId}` }, { status: 400 });
    }
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    // 有規格的商品:檢查對應規格組合的庫存;否則檢查總庫存
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length > 0) {
      const label = String(item.variant ?? '');
      const v = variants.find((vv: { options: string[] }) => vv.options.join(' / ') === label);
      if (!v || v.inventory < quantity) {
        return NextResponse.json({ error: `「${product.name}」${label} 庫存不足` }, { status: 409 });
      }
    } else if (product.inventory < quantity) {
      return NextResponse.json({ error: `「${product.name}」庫存不足` }, { status: 409 });
    }
    subtotal += product.price * quantity;
    const label = item.variant ?? '標準款';
    orderItems.push({
      name: product.name,
      variant: label,
      price: product.price,
      quantity,
      productId: product.id,
      sku: label && label !== '標準款' ? `${product.id}::${label}` : product.id,
      item_status: 'NORMAL',
      image: product.image ?? '',
      original_price: product.original_price ?? null,
    });
  }

  const { data: shipSettings } = await supabase.from('site_settings').select('shipping_fees').maybeSingle();
  const shipping = computeShipping(subtotal, items, products, shippingMethod, resolveMethodFee(shipSettings, shippingMethod));

  // 折扣碼(可選):由後端重新驗證計算,避免竄改
  let discount = 0;
  let discountCode = '';
  let appliedCouponId = '';
  let appliedUserCouponId = '';
  let couponSnapshot: Record<string, unknown> = {};
  const rawCode = String(body?.discount_code ?? '').trim().toUpperCase();
  const rawUserCouponId = String(body?.user_coupon_id ?? '').trim();
  if (rawCode) {
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

    function acceptCoupon(d: Discount, userCouponStatus?: string | null) {
      return usageCounts(d.id).then((counts) => {
        const result = evaluateCoupon(d, {
          subtotal,
          shipping,
          items: orderItems,
          products,
          userId: user?.id ?? null,
          isFirstPurchase: (orderCount ?? 0) === 0,
          userCouponStatus,
          ...counts,
        });
        if (!result.ok) return result.reason ?? '優惠券不可使用';
        discount = result.finalCouponAmount;
        discountCode = d.code;
        appliedCouponId = d.id;
        couponSnapshot = {
          id: d.id,
          name: d.name ?? '',
          code: d.code,
          type: d.type,
          value: d.value,
          min_spend: d.min_spend,
          max_discount: d.max_discount ?? null,
          start_at: d.start_at ?? null,
          end_at: d.end_at ?? null,
          total_limit: d.total_limit ?? null,
          per_user_limit: d.per_user_limit ?? null,
          applicable_products: d.applicable_products ?? [],
          applicable_categories: d.applicable_categories ?? [],
          applicable_users: d.applicable_users ?? 'all',
          stackable: d.stackable ?? false,
          discount_amount: result.finalCouponAmount,
          item_discount: result.discount,
          shipping_discount: result.shippingDiscount,
        };
        return '';
      });
    }

    if (rawUserCouponId && user) {
      const { data: userCoupon } = await supabase
        .from('user_coupons')
        .select('*, coupon:discounts(*)')
        .eq('id', rawUserCouponId)
        .eq('user_id', user.id)
        .maybeSingle();
      const d = userCoupon?.coupon as Discount | undefined;
      if (!userCoupon || !d || d.code !== rawCode) {
        return NextResponse.json({ error: '這張會員優惠券不可使用' }, { status: 400 });
      }
      const reason = await acceptCoupon(d, userCoupon.status);
      if (reason) return NextResponse.json({ error: reason }, { status: 400 });
      appliedUserCouponId = rawUserCouponId;
    } else {
      if (!user && rawCode) {
        // 允許全站公開折扣碼未登入使用,但會員限制券會在規則中被擋下。
      }
      const { data: d } = await supabase
        .from('discounts')
        .select('*')
        .eq('code', rawCode)
        .eq('active', true)
        .maybeSingle();
      if (!d) return NextResponse.json({ error: '折扣碼無效或已停用' }, { status: 400 });
      const reason = await acceptCoupon(d as Discount);
      if (reason) return NextResponse.json({ error: reason }, { status: 400 });
    }
  }

  const total = Math.max(0, subtotal + shipping - discount);
  // 需線上付款 → 尚未付款;門市代收/貨到付款 → 待出貨
  const initialStatus = initialOrderStatus(shippingMethod, paymentMethod);

  // 訂單編號:UR + 台灣日期(YYYYMMDD) + 當日流水號(4 碼),例如 UR202608290001
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const ymd = tw.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `UR${ymd}`;
  // 單號全站唯一:跨所有店家計數
  const { count: todayCount } = await createAdminClient()
    .from('orders')
    .select('order_no', { count: 'exact', head: true })
    .like('order_no', `${prefix}%`);
  const orderNo = `${prefix}${String((todayCount ?? 0) + 1).padStart(4, '0')}`;
  const guestAccess = user ? null : createOrderAccessToken(orderNo);

  // 寫入訂單
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_no: orderNo,
      customer_name,
      email,
      phone,
      address,
      note,
      items: orderItems,
      subtotal,
      shipping,
      shipping_method: shippingMethod,
      payment_method: paymentMethod,
      store_id: pickupStore.store_id,
      store_name: pickupStore.store_name,
      store_phone: pickupStore.store_phone,
      store_address: pickupStore.store_address,
      store_ship_type: pickupStore.store_ship_type,
      store_lgs_type: pickupStore.store_lgs_type,
      store_extra: pickupStore.store_id ? pickupStore : null,
      discount,
      discount_code: discountCode,
      coupon_id: appliedCouponId || null,
      user_coupon_id: appliedUserCouponId || null,
      coupon_snapshot: couponSnapshot,
      total,
      shipping_discount: Number(couponSnapshot.shipping_discount ?? 0) || 0,
      paid_amount: 0,
      refund_amount: 0,
      net_amount: total,
      status: initialStatus,
      paid: false,
      stock_committed: true,
      ...deriveStatuses(initialStatus, false),
      user_id: user?.id ?? null,
    })
    .select()
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 });

  // 建立初始付款紀錄 + 訂單成立歷程(失敗不影響下單)
  try {
    const providerMap: Record<string, string> = {
      credit_card: 'NewebPay', atm: 'NewebPay', line_pay: 'LINE Pay', cod: '貨到付款',
    };
    await supabase.from('payments').insert({
      order_id: order.id,
      provider: providerMap[paymentMethod] ?? '',
      payment_method: paymentMethod,
      amount: total,
      status: 'PENDING',
    });
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      type: 'order',
      from_status: '',
      to_status: deriveStatuses(initialStatus, false).order_status,
      note: initialStatus === '尚未付款' ? '訂單成立,待付款' : '訂單成立',
      created_by: 'SYSTEM',
    });
  } catch {
    /* 紀錄失敗不影響下單 */
  }

  if (appliedCouponId) {
    if (appliedUserCouponId) {
      await supabase
        .from('user_coupons')
        .update({ status: 'used', used_at: new Date().toISOString(), order_id: order.id })
        .eq('id', appliedUserCouponId)
        .eq('user_id', user?.id ?? '');
    }
    await supabase.from('coupon_usages').insert({
      coupon_id: appliedCouponId,
      user_id: user?.id ?? null,
      user_coupon_id: appliedUserCouponId || null,
      order_id: order.id,
      original_amount: subtotal,
      discount_amount: discount,
      final_amount: total,
    });
  }

  // 扣減庫存(用工作副本累積,避免同商品多規格互相覆蓋),最後每個商品寫一次
  type WorkProduct = { inventory: number; variants: { options: string[]; inventory: number }[] };
  const working = new Map<string, WorkProduct>();
  for (const item of items) {
    const pid = String(item.productId);
    const base = priceMap.get(pid);
    if (!base) continue;
    const w =
      working.get(pid) ??
      ({
        inventory: base.inventory,
        variants: (Array.isArray(base.variants) ? base.variants : []).map(
          (v: { options: string[]; inventory: number }) => ({ ...v }),
        ),
      } as WorkProduct);
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (w.variants.length > 0) {
      const label = String(item.variant ?? '');
      const v = w.variants.find((vv) => vv.options.join(' / ') === label);
      if (v) v.inventory = Math.max(0, v.inventory - quantity);
      w.inventory = w.variants.reduce((n, vv) => n + vv.inventory, 0);
    } else {
      w.inventory = Math.max(0, w.inventory - quantity);
    }
    working.set(pid, w);
  }
  for (const [pid, w] of working) {
    await supabase
      .from('products')
      .update({ inventory: w.inventory, variants: w.variants })
      .eq('id', pid);
  }

  // 記錄出庫(訂單銷貨),供進出庫紀錄查閱
  try {
    const movements = items
      .map((item) => {
        const base = priceMap.get(String(item.productId));
        if (!base) return null;
        const hasVariants = Array.isArray(base.variants) && base.variants.length > 0;
        return {
          product_id: String(item.productId),
          variant_key: hasVariants ? String(item.variant ?? '') : '',
          type: 'out',
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          unit_price: base.price ?? 0,
          location: customer_name || '',
          handler: '系統(訂單)',
          note: `訂單 ${orderNo}`,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    if (movements.length) await supabase.from('stock_movements').insert(movements);
  } catch {
    /* 記錄失敗不影響下單 */
  }

  const response = NextResponse.json(order as Order, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  if (guestAccess) response.cookies.set(orderAccessCookieName(orderNo), guestAccess, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: ORDER_ACCESS_MAX_AGE,
  });
  return response;
}
