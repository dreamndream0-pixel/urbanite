import { NextResponse } from 'next/server';
import { handleBizWebhook } from '@/lib/booking/line-own';

export const dynamic = 'force-dynamic';

// POST /api/booking/line/[businessId] — 名片主人自己的 LINE 官方帳號 Webhook(綁定碼、加好友說明)
export async function POST(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const raw = await request.text();
  try {
    const r = await handleBizWebhook(businessId, raw, request.headers.get('x-line-signature'));
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error('booking line webhook', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
