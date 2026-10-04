import { NextResponse } from 'next/server';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { getMessagingConfig } from '@/lib/line-messaging';
import { logEvent, verifyTracked } from '@/lib/line-bot';

export const dynamic = 'force-dynamic';

// GET /api/line/r?u=&k=&s= — LINE 訊息按鈕點擊紀錄後轉址(只接受簽章過的網址)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const u = url.searchParams.get('u') ?? '';
  const k = url.searchParams.get('k') ?? '';
  const s = url.searchParams.get('s') ?? '';
  const { channelSecret } = await getMessagingConfig();
  if (!u || !verifyTracked(u, k, s, channelSecret)) return NextResponse.redirect(getConfiguredSiteUrl());
  await logEvent('click', null, k);
  return NextResponse.redirect(u);
}
