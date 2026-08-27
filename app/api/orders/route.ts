import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import type { Order, OrderItem } from '@/lib/types';

const FREE_SHIPPING_THRESHOLD = 2000;
const SHIPPING_FEE = 120;

// GET /api/orders — 取得所有訂單(限管理員)
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Order[]);
}

// POST /api/orders — 前台下單(公開)
// 前端只送 { customer_name, email, items:[{ productId, variant, quantity }] }
// 價格與金額全部由後端依資料庫重新計算,避免竄改。
export async function POST(request: Request) {
  const body = await request.json();
  const { customer_name, email, items } = body ?? {};

  if (!customer_name || !email) {
    return NextResponse.json({ error: '請填寫姓名與 Email' }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: '購物車是空的' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 一次查出所有相關商品
  const productIds = [...new Set(items.map((i) => String(i.productId)))];
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds);

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const priceMap = new Map((products ?? []).map((p) => [p.id, p]));

  // 依資料庫價格組出明細並計算金額
  const orderItems: OrderItem[] = [];
  let subtotal = 0;
  for (const item of items) {
    const product = priceMap.get(String(item.productId));
    if (!product) {
      return NextResponse.json({ error: `找不到商品:${item.productId}` }, { status: 400 });
    }
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (product.inventory < quantity) {
      return NextResponse.json({ error: `「${product.name}」庫存不足` }, { status: 409 });
    }
    subtotal += product.price * quantity;
    orderItems.push({
      name: product.name,
      variant: item.variant ?? '標準款',
      price: product.price,
      quantity,
    });
  }

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;
  const orderNo = `UB-${Date.now().toString().slice(-8)}`;

  // 若客人已登入,把訂單關聯到他的帳號(訪客下單則為 null)
  const user = await getSessionUser();

  // 寫入訂單
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_no: orderNo,
      customer_name,
      email,
      items: orderItems,
      subtotal,
      shipping,
      total,
      status: '待出貨',
      paid: false,
      user_id: user?.id ?? null,
    })
    .select()
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 });

  // 扣減庫存
  for (const item of items) {
    const product = priceMap.get(String(item.productId));
    if (!product) continue;
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    await supabase
      .from('products')
      .update({ inventory: product.inventory - quantity })
      .eq('id', product.id);
  }

  return NextResponse.json(order as Order, { status: 201 });
}
