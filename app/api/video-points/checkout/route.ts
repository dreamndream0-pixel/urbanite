import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { buildMPGParams, getNewebpayConfig } from '@/lib/newebpay';
import { VIDEO_POINT_PACKAGES, newVideoOrderNo, videoPointsReady, type VideoPointPackage } from '@/lib/video-points';

export const dynamic = 'force-dynamic';

// POST /api/video-points/checkout { package } — 建立影片點數購買訂單,回傳送往藍新的表單
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const { package: key } = (await request.json().catch(() => ({}))) as { package?: VideoPointPackage };
  const pack = VIDEO_POINT_PACKAGES.find((p) => p.key === key);
  if (!pack) return NextResponse.json({ error: '請選擇點數方案' }, { status: 400 });

  const cfg = await getNewebpayConfig();
  if (!cfg.merchantId || !cfg.hashKey || !cfg.hashIv) return NextResponse.json({ error: '金流尚未設定,請聯絡客服' }, { status: 503 });
  if (!(await videoPointsReady())) return NextResponse.json({ error: '點數系統準備中,請稍後再試;尚未建立付款或扣款。' }, { status: 503 });

  const orderNo = newVideoOrderNo();
  const { error } = await createAdminClient().from('video_point_payments').insert({ order_no: orderNo, user_id: user.id, package: pack.key, points: pack.points, amount: pack.amount });
  if (error) return NextResponse.json({ error: '無法建立訂單,請稍後再試' }, { status: 400 });

  const { params, action } = await buildMPGParams({
    order_no: orderNo,
    total: pack.amount,
    email: user.email?.endsWith('@line.urbanite.com.tw') ? '' : user.email ?? '',
    items: [],
    itemDesc: `Seedance 影片點數 ${pack.points} 點`,
    returnUrl: `${cfg.siteUrl}/api/video-points/return`,
    clientBackUrl: `${cfg.siteUrl}/video/points`,
  });
  return NextResponse.json({ action, params, orderNo });
}
