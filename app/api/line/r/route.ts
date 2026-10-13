import { NextResponse } from 'next/server';
import { logEvent, verifyTracked } from '@/lib/line-bot';
import { botChannel, botSiteUrl, lineBotSchemaReady, runAsShop } from '@/lib/line-channel';
import { getCurrentShop, isPlatformShop } from '@/lib/shop';

export const dynamic = 'force-dynamic';

// GET /api/line/r?u=&k=&s= — LINE 訊息按鈕點擊紀錄後轉址(只接受簽章過的網址)。依網域用該店家的金鑰驗證、記到該店家
export async function GET(request: Request) {
  const url = new URL(request.url);
  const u = url.searchParams.get('u') ?? '';
  const k = url.searchParams.get('k') ?? '';
  const s = url.searchParams.get('s') ?? '';
  const shop = await getCurrentShop();
  const platform = !shop || isPlatformShop(shop);
  return runAsShop(platform ? null : shop, async () => {
    const { channelSecret } = await botChannel();
    if (!u || !verifyTracked(u, k, s, channelSecret)) return NextResponse.redirect(botSiteUrl());
    if (platform || (await lineBotSchemaReady())) await logEvent('click', null, k);
    return NextResponse.redirect(u);
  });
}
