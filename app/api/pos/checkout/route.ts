import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { evaluateCoupon } from '@/lib/discount';
import { consumeCredit, creditQuote } from '@/lib/loyalty';
import { deriveStatuses } from '@/lib/order-status';
import { isValidPrice, productPrice } from '@/lib/product-price';
import { applyStockLines, nextOrderNo, openSession } from '@/lib/pos-server';
import { manualDiscountAmount, POS_SHIPPING_METHOD, resolvePosSettings, settlePayments, variantKey, type PosDiscount, type PosMeta } from '@/lib/pos';
import type { Customer, Discount, Order, OrderItem, Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

type InputItem = { productId?: unknown; variant?: unknown; quantity?: unknown; price?: unknown };

// POST /api/pos/checkout — POS 結帳(限管理員 / 店員)
// { items:[{ productId, variant, quantity, price? }], discount?, discount_code?, customer?, use_credit?, payments:[{ method, amount }], note?, client_id?, preview? }
// 訂單當場成交:已付款、已完成;扣庫存並寫出庫紀錄,後台訂單 / 庫存 / 報表共用。
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const shop = await getCurrentShop();
  if (!shop) return NextResponse.json({ error: '找不到這家店' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const input = (Array.isArray(body?.items) ? body.items : []) as InputItem[];
  if (!input.length) return NextResponse.json({ error: '還沒有加入商品' }, { status: 400 });
  if (input.length > 200) return NextResponse.json({ error: '品項太多,請分開結帳' }, { status: 400 });

  const supabase = await shopAdminClient();
  const cashier = admin.email ?? '';
  const clientId = String(body?.client_id ?? '').slice(0, 64);
  const preview = body?.preview === true; // 只試算金額(折扣碼、回饋金),不成立訂單

  // 同一筆送兩次(連按、網路重送)只成立一張單
  if (clientId && !preview) {
    const { data: dup } = await supabase.from('orders').select('*').eq('channel', 'pos').contains('pos', { client_id: clientId }).limit(1).maybeSingle();
    if (dup) return NextResponse.json(dup as Order, { status: 200 });
  }

  const [{ data: settingsRow }, { data: productRows, error: prodErr }] = await Promise.all([
    supabase.from('site_settings').select('pos_settings').maybeSingle(),
    supabase.from('products').select('*').in('id', [...new Set(input.map((i) => String(i.productId ?? '')))]),
  ]);
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });
  const settings = resolvePosSettings(settingsRow?.pos_settings);
  const products = (productRows ?? []) as Product[];
  const byId = new Map(products.map((p) => [p.id, p]));

  // 明細:價格以資料庫為準;店員改價(price)另外記下原定價
  const orderItems: OrderItem[] = [];
  const stockLines: { productId: string; variant: string; quantity: number }[] = [];
  const need = new Map<string, number>();
  let subtotal = 0;
  for (const item of input) {
    const product = byId.get(String(item.productId ?? ''));
    if (!product) return NextResponse.json({ error: `找不到商品:${String(item.productId ?? '')}` }, { status: 400 });
    const quantity = Math.floor(Number(item.quantity));
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 9999) return NextResponse.json({ error: `「${product.name}」數量不正確` }, { status: 400 });
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const label = String(item.variant ?? '');
    let stock = product.inventory ?? 0;
    if (variants.length > 0) {
      const matches = variants.filter((v) => variantKey(v.options) === label);
      if (matches.length !== 1) return NextResponse.json({ error: `請選擇「${product.name}」的規格` }, { status: 400 });
      stock = matches[0].inventory ?? 0;
    }
    const stockKey = `${product.id}::${variants.length ? label : ''}`;
    const wanted = (need.get(stockKey) ?? 0) + quantity;
    need.set(stockKey, wanted);
    if (!preview && !settings.allowOversell && wanted > stock) {
      return NextResponse.json({ error: `「${product.name}」${variants.length ? label : ''} 庫存不足(剩 ${stock})`, code: 'OUT_OF_STOCK' }, { status: 409 });
    }
    const listPrice = productPrice(product, label);
    if (!isValidPrice(listPrice)) return NextResponse.json({ error: `「${product.name}」售價設定有誤` }, { status: 409 });
    const override = item.price == null || item.price === '' ? null : Math.floor(Number(item.price));
    if (override !== null && !isValidPrice(override)) return NextResponse.json({ error: `「${product.name}」改價金額不正確` }, { status: 400 });
    const price = override ?? listPrice;
    subtotal += price * quantity;
    const shown = variants.length ? label : '標準款';
    orderItems.push({
      name: product.name, variant: shown, price, quantity, productId: product.id,
      sku: variants.length ? `${product.id}::${label}` : product.id,
      item_status: 'NORMAL', image: product.image ?? '', original_price: product.original_price ?? null,
      ...(price !== listPrice ? { list_price: listPrice } : {}),
    });
    stockLines.push({ productId: product.id, variant: variants.length ? label : '', quantity });
  }

  // 會員(選填):帶入姓名 / 電話,可以用回饋金、累積消費
  let member: Customer | null = null;
  const memberId = String(body?.customer?.user_id ?? '').trim();
  if (memberId) {
    const { data } = await supabase.from('customers').select('*').eq('user_id', memberId).maybeSingle();
    if (!data) return NextResponse.json({ error: '找不到這位會員' }, { status: 400 });
    member = data as Customer;
  }
  const customerName = String(member?.name || body?.customer?.name || '').trim().slice(0, 60) || '門市顧客';
  const phone = String(member?.phone || body?.customer?.phone || '').trim().slice(0, 30);
  const email = String(member?.email || '').trim();

  // 整筆折扣(店員手動)+ 折扣碼
  const rawDiscount = body?.discount as PosDiscount | null | undefined;
  const manualDiscount = manualDiscountAmount(subtotal, rawDiscount && (rawDiscount.type === 'percent' || rawDiscount.type === 'amount') ? { type: rawDiscount.type, value: Number(rawDiscount.value) } : null);
  let couponDiscount = 0;
  let coupon: Discount | null = null;
  const rawCode = String(body?.discount_code ?? '').trim().toUpperCase();
  if (rawCode) {
    const { data: d } = await supabase.from('discounts').select('*').eq('code', rawCode).eq('active', true).maybeSingle();
    if (!d) return NextResponse.json({ error: '折扣碼無效或已停用' }, { status: 400 });
    const [total, perUser, orderCount] = await Promise.all([
      supabase.from('coupon_usages').select('id', { count: 'exact', head: true }).eq('coupon_id', d.id),
      member ? supabase.from('coupon_usages').select('id', { count: 'exact', head: true }).eq('coupon_id', d.id).eq('user_id', member.user_id) : Promise.resolve({ count: 0 }),
      member ? supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', member.user_id) : Promise.resolve({ count: 0 }),
    ]);
    const result = evaluateCoupon(d as Discount, {
      subtotal: subtotal - manualDiscount, shipping: 0, items: orderItems, products, userId: member?.user_id ?? null,
      isFirstPurchase: (orderCount.count ?? 0) === 0, totalUsageCount: total.count ?? 0, userUsageCount: perUser.count ?? 0,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason ?? '折扣碼不可使用' }, { status: 400 });
    coupon = d as Discount;
    couponDiscount = Math.min(subtotal - manualDiscount, result.discount);
  }
  const discount = manualDiscount + couponDiscount;

  // 回饋金折抵(會員)
  const quote = member ? await creditQuote(shop.id, member.user_id, subtotal - discount).catch(() => null) : null;
  const creditUsed = quote ? Math.min(Math.max(0, Math.floor(Number(body?.use_credit ?? 0) || 0)), quote.max) : 0;
  const total = Math.max(0, subtotal - discount - creditUsed);
  if (preview) return NextResponse.json({ subtotal, manualDiscount, couponDiscount, creditUsed, total }, { headers: { 'Cache-Control': 'private, no-store' } });

  // 付款:可拆多種方式;現金可多收(找零)
  const pay = settlePayments(total, Array.isArray(body?.payments) ? body.payments : []);
  if (total > 0 && pay.error) return NextResponse.json({ error: pay.error }, { status: 400 });
  if (pay.list.some((p) => !settings.paymentMethods.includes(p.method))) return NextResponse.json({ error: '付款方式不在 POS 設定內' }, { status: 400 });
  const applied = total > 0 ? pay.applied : [];
  const paymentMethod = applied.map((p) => p.method).join('+') || '免付款';

  const session = await openSession(supabase);
  const now = new Date().toISOString();
  const pos: PosMeta & { client_id?: string } = {
    cashier, payments: applied, tendered: total > 0 ? pay.tendered : 0, change: total > 0 ? pay.change : 0,
    manual_discount: manualDiscount,
    ...(manualDiscount && rawDiscount ? { discount_label: rawDiscount.type === 'percent' ? `折 ${Number(rawDiscount.value)}%` : '折讓' } : {}),
    ...(clientId ? { client_id: clientId } : {}),
  };

  // 寫入訂單(單號撞號時重取)
  let order: Order | null = null;
  let lastError = '';
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    const { data, error } = await supabase.from('orders').insert({
      order_no: await nextOrderNo(attempt),
      customer_name: customerName, email, phone, address: '', note: String(body?.note ?? '').trim().slice(0, 500),
      items: orderItems, subtotal, shipping: 0, shipping_method: POS_SHIPPING_METHOD, payment_method: paymentMethod,
      discount, discount_code: coupon?.code ?? '', coupon_id: coupon?.id ?? null,
      coupon_snapshot: coupon ? { id: coupon.id, name: coupon.name ?? '', code: coupon.code, type: coupon.type, value: coupon.value, discount_amount: couponDiscount, item_discount: couponDiscount, shipping_discount: 0 } : {},
      total, paid_amount: total, refund_amount: 0, net_amount: total,
      status: '已完成', paid: true, stock_committed: true, ...deriveStatuses('已完成', true), completed_at: now,
      user_id: member?.user_id ?? null, credit_used: creditUsed, credit_rate: quote?.tier.rate ?? 0, tier_at_order: quote?.tier.name ?? '',
      channel: 'pos', pos, pos_session_id: session?.id ?? null,
    }).select().single();
    if (data) order = data as Order;
    else if (error?.code !== '23505') return NextResponse.json({ error: error?.message ?? '建立訂單失敗' }, { status: 400 });
    else lastError = error.message;
  }
  if (!order) return NextResponse.json({ error: lastError || '建立訂單失敗,請再試一次' }, { status: 409 });

  // 扣回饋金(原子操作);餘額同時被別筆用掉時改成不折抵 —— 現場已收款,差額記在備註請店員補收
  if (creditUsed > 0 && member) {
    try {
      await consumeCredit(shop.id, member.user_id, order.id, creditUsed);
    } catch {
      const { data: fixed } = await supabase.from('orders').update({ credit_used: 0, admin_note: `回饋金餘額不足,未折抵 NT$${creditUsed}(請補收)` }).eq('id', order.id).select().single();
      if (fixed) order = fixed as Order;
    }
  }

  // 扣庫存、寫出庫紀錄
  try {
    await applyStockLines(supabase, byId, stockLines, -1);
  } catch (error) {
    console.error('pos stock', error);
  }
  try {
    await supabase.from('stock_movements').insert(stockLines.map((line, i) => ({
      product_id: line.productId, variant_key: line.variant, type: 'out', quantity: line.quantity,
      unit_price: orderItems[i].price, location: customerName, handler: `POS(${cashier})`, note: `POS 銷售 ${order!.order_no}`,
    })));
    if (applied.length) await supabase.from('payments').insert(applied.map((p) => ({ order_id: order!.id, provider: 'POS', payment_method: p.method, amount: p.amount, status: 'PAID', paid_at: now })));
    await supabase.from('order_status_history').insert({ order_id: order.id, type: 'order', from_status: '', to_status: 'COMPLETED', note: `POS 門市結帳(${paymentMethod})`, created_by: cashier || 'POS' });
    if (coupon) await supabase.from('coupon_usages').insert({ coupon_id: coupon.id, user_id: member?.user_id ?? null, order_id: order.id, original_amount: subtotal, discount_amount: couponDiscount, final_amount: total });
  } catch (error) {
    console.error('pos records', error);
  }

  return NextResponse.json(order, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
