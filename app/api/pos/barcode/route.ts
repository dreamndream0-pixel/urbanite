import { NextResponse } from 'next/server';
import { can, getPosUser } from '@/lib/pos-auth';
import { shopAdminClient } from '@/lib/shop';
import { findByCode, variantKey, type PosProduct } from '@/lib/pos';
import { loadPosProducts } from '@/lib/pos-server';

export const dynamic = 'force-dynamic';

// POST /api/pos/barcode { product_id, variant, barcode } — 把條碼綁到商品 / 規格(barcode 空白 = 清除)
export async function POST(request: Request) {
  const me = await getPosUser();
  if (!me) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (!can(me, 'barcode')) return NextResponse.json({ error: '這個帳號沒有「綁定條碼」的權限' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const productId = String(body?.product_id ?? '').trim();
  const variant = String(body?.variant ?? '');
  const barcode = String(body?.barcode ?? '').trim().slice(0, 64);
  const supabase = await shopAdminClient();
  const products = await loadPosProducts(supabase);
  const product = products.find((p) => p.id === productId);
  if (!product) return NextResponse.json({ error: '找不到商品' }, { status: 404 });

  if (barcode) {
    const used = findByCode(products, barcode);
    if (used && !(used.product.id === productId && (used.variant ?? '') === variant)) {
      return NextResponse.json({ error: `這個條碼已經用在「${used.product.name}${used.variant ? ` ${used.variant}` : ''}」` }, { status: 409 });
    }
  }

  let patch: Partial<PosProduct>;
  if (product.variants?.length) {
    if (!product.variants.some((v) => variantKey(v.options) === variant)) return NextResponse.json({ error: '請選擇規格' }, { status: 400 });
    patch = { variants: product.variants.map((v) => (variantKey(v.options) === variant ? { ...v, barcode } : v)) };
  } else {
    patch = { barcode };
  }
  const { error } = await supabase.from('products').update(patch).eq('id', productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...product, ...patch });
}
