import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { StockMovement, Variant } from '@/lib/types';

// GET /api/stock-movements — 進出庫紀錄(限管理員)
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as StockMovement[]);
}

// POST /api/stock-movements — 新增一筆入庫/出庫,並自動更新庫存(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  const productId = String(body?.product_id ?? '').trim();
  const variantKey = String(body?.variant_key ?? '').trim();
  const type = body?.type === 'out' ? 'out' : 'in';
  const quantity = Math.max(1, Math.floor(Number(body?.quantity) || 0));
  const unitPrice = Math.max(0, Math.floor(Number(body?.unit_price) || 0));

  if (!productId) return NextResponse.json({ error: '請選擇品項' }, { status: 400 });
  if (!quantity) return NextResponse.json({ error: '數量需大於 0' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });
  if (!product) return NextResponse.json({ error: '找不到品項' }, { status: 400 });

  const delta = type === 'in' ? quantity : -quantity;
  const variants: Variant[] = Array.isArray(product.variants) ? product.variants : [];

  if (variants.length > 0 && variantKey) {
    const next = variants.map((v) =>
      v.options.join(' / ') === variantKey
        ? { ...v, inventory: Math.max(0, (v.inventory ?? 0) + delta) }
        : v,
    );
    const total = next.reduce((n, v) => n + (v.inventory ?? 0), 0);
    await supabase.from('products').update({ variants: next, inventory: total }).eq('id', productId);
  } else {
    const inv = Math.max(0, (product.inventory ?? 0) + delta);
    await supabase.from('products').update({ inventory: inv }).eq('id', productId);
  }

  const { data: movement, error: mvErr } = await supabase
    .from('stock_movements')
    .insert({
      product_id: productId,
      variant_key: variantKey,
      type,
      quantity,
      unit_price: unitPrice,
      location: String(body?.location ?? '').trim(),
      handler: String(body?.handler ?? '').trim(),
      note: String(body?.note ?? '').trim(),
    })
    .select()
    .single();

  if (mvErr) return NextResponse.json({ error: mvErr.message }, { status: 400 });
  return NextResponse.json(movement as StockMovement, { status: 201 });
}

// DELETE /api/stock-movements?id=... — 刪除一筆紀錄,並反向調整庫存(限管理員)
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: '缺少紀錄 id' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: movement, error: mvReadErr } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (mvReadErr) return NextResponse.json({ error: mvReadErr.message }, { status: 500 });
  if (!movement) return NextResponse.json({ error: '找不到進出庫紀錄' }, { status: 404 });

  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', movement.product_id)
    .maybeSingle();
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  if (product) {
    const delta = movement.type === 'in' ? -movement.quantity : movement.quantity;
    const variantKey = String(movement.variant_key ?? '');
    const variants: Variant[] = Array.isArray(product.variants) ? product.variants : [];

    if (variants.length > 0 && variantKey) {
      const next = variants.map((v) =>
        v.options.join(' / ') === variantKey
          ? { ...v, inventory: Math.max(0, (v.inventory ?? 0) + delta) }
          : v,
      );
      const total = next.reduce((n, v) => n + (v.inventory ?? 0), 0);
      await supabase.from('products').update({ variants: next, inventory: total }).eq('id', product.id);
    } else {
      const inv = Math.max(0, (product.inventory ?? 0) + delta);
      await supabase.from('products').update({ inventory: inv }).eq('id', product.id);
    }
  }

  const { error } = await supabase.from('stock_movements').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, movement: movement as StockMovement });
}
