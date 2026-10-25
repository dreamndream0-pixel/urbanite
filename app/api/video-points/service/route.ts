import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildMPGParams, getNewebpayConfig } from '@/lib/newebpay';
import { isVideoStudioRequest, newVideoOrderNo, VIDEO_POINT_PACKAGES, VIDEO_TRIAL_POINTS, videoPointsReady, videoStudioUrl } from '@/lib/video-points';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/video-points/service — 僅供影片網站(伺服器對伺服器)使用,以共用密鑰驗證。
// actions: summary / balance / debit / refund / trial / checkout
export async function POST(request: Request) {
  if (!(await isVideoStudioRequest(request))) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; userId?: string; points?: number; ref?: string; package?: string; email?: string };
  if (!body.userId || !UUID.test(body.userId)) return NextResponse.json({ error: 'INVALID_USER' }, { status: 400 });
  const ref = typeof body.ref === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(body.ref) ? body.ref : '';
  const db = createAdminClient();
  const balanceOf = async () => {
    const { data, error } = await db.from('video_point_accounts').select('balance').eq('user_id', body.userId).maybeSingle();
    if (error) throw error;
    return data?.balance ?? 0;
  };

  try {
    if (body.action === 'balance') return NextResponse.json({ balance: await balanceOf() });
    if (body.action === 'summary') {
      const { data: ledger } = await db.from('video_point_ledger').select('delta, reason, created_at').eq('user_id', body.userId).order('created_at', { ascending: false }).limit(20);
      return NextResponse.json({ balance: await balanceOf(), packages: VIDEO_POINT_PACKAGES, ledger: ledger ?? [] });
    }
    if (body.action === 'debit') {
      if (!ref || !Number.isInteger(body.points) || (body.points ?? 0) <= 0 || (body.points ?? 0) > 100000) return NextResponse.json({ error: 'INVALID_DEBIT' }, { status: 400 });
      const { data, error } = await db.rpc('video_points_debit_v1', { p_user: body.userId, p_points: body.points, p_ref: ref });
      if (error?.message?.includes('INSUFFICIENT_POINTS')) return NextResponse.json({ error: 'INSUFFICIENT_POINTS' }, { status: 402 });
      if (error) throw error;
      return NextResponse.json({ balance: data });
    }
    if (body.action === 'refund') {
      if (!ref) return NextResponse.json({ error: 'INVALID_REFUND' }, { status: 400 });
      const { data, error } = await db.rpc('video_points_refund_v1', { p_user: body.userId, p_ref: ref });
      if (error) throw error;
      return NextResponse.json({ balance: data });
    }
    if (body.action === 'trial') {
      // 只送給已驗證的會員:Email 已確認,或以 Google 等第三方登入。由本站再查一次,不採信呼叫端。
      const { data: found } = await db.auth.admin.getUserById(body.userId);
      const user = found?.user;
      const verified = Boolean(user?.email_confirmed_at) || (user?.app_metadata?.provider ?? 'email') !== 'email';
      if (!user || !verified) return NextResponse.json({ balance: await balanceOf() });
      const { data, error } = await db.rpc('video_points_grant_trial_v1', { p_user: body.userId, p_points: VIDEO_TRIAL_POINTS });
      if (error) throw error;
      return NextResponse.json({ balance: data });
    }
    if (body.action === 'checkout') {
      const pack = VIDEO_POINT_PACKAGES.find((p) => p.key === body.package);
      if (!pack) return NextResponse.json({ error: 'INVALID_PACKAGE' }, { status: 400 });
      const cfg = await getNewebpayConfig();
      if (!cfg.merchantId || !cfg.hashKey || !cfg.hashIv || !(await videoPointsReady())) return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 503 });
      const orderNo = newVideoOrderNo();
      const { error } = await db.from('video_point_payments').insert({ order_no: orderNo, user_id: body.userId, package: pack.key, points: pack.points, amount: pack.amount });
      if (error) throw error;
      const email = typeof body.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(body.email) && !body.email.endsWith('@line.urbanite.com.tw') ? body.email : '';
      const { params, action } = await buildMPGParams({
        order_no: orderNo, total: pack.amount, email, items: [],
        itemDesc: `Seedance Studio 點數 ${pack.points} 點`,
        returnUrl: `${cfg.siteUrl}/api/video-points/return`,
        clientBackUrl: videoStudioUrl(),
      });
      return NextResponse.json({ action, params, orderNo });
    }
  } catch {
    return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 503 });
  }
  return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
