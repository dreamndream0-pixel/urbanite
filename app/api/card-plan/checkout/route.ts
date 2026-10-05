import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { buildMPGParams, getNewebpayConfig } from '@/lib/newebpay';
import { newCardOrderNo } from '@/lib/card-payment';
import { PERIODS, TIERS, type CardPeriod, type PaidTier } from '@/lib/card-plan';

export const dynamic = 'force-dynamic';

// POST /api/card-plan/checkout { tier, period } — 建立付費方案付款,回傳送往藍新的表單
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const { tier = 'plus', period } = (await request.json().catch(() => ({}))) as { tier?: PaidTier; period?: CardPeriod };
  const info = TIERS.find((t) => t.key === tier);
  if (!info?.prices || !period || !PERIODS[period]) return NextResponse.json({ error: '請選擇方案' }, { status: 400 });
  if (!info.available) return NextResponse.json({ error: `${info.name} 請聯繫專員開通` }, { status: 400 });
  const price = { amount: info.prices[period], label: `${info.name} ${PERIODS[period].label}` };

  const cfg = await getNewebpayConfig();
  if (!cfg.merchantId || !cfg.hashKey || !cfg.hashIv) return NextResponse.json({ error: '金流尚未設定,請聯絡客服' }, { status: 503 });

  const orderNo = newCardOrderNo();
  const { error } = await createAdminClient().from('card_payments').insert({ order_no: orderNo, user_id: user.id, tier, period, amount: price.amount });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { params, action } = await buildMPGParams({
    order_no: orderNo,
    total: price.amount,
    email: user.email?.endsWith('@line.urbanite.com.tw') ? '' : user.email ?? '',
    items: [],
    itemDesc: `URBANLINKS ${price.label}`,
    returnUrl: `${cfg.siteUrl}/api/card-plan/return`,
    clientBackUrl: `${cfg.siteUrl}/mycard/upgrade`,
  });
  return NextResponse.json({ action, params, orderNo });
}
