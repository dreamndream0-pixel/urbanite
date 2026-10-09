import { NextResponse } from 'next/server';
import { getCurrentShop, isPlatformShop, shopUrl } from '@/lib/shop';
import { getConfiguredSiteUrl } from '@/lib/site-url';

// 店家(取貨不付款、自己寄)的門市地圖:7-11 直接開 7-11 官方電子地圖,選完直接回本站,不經過藍新。
// 全家等其他超商的地圖需要商家代號,仍沿用藍新門市地圖(只選門市)。
export async function GET(request: Request) {
  const url = new URL(request.url);
  const shipType = url.searchParams.get('ship_type') || '1';
  if (shipType !== '1') {
    return NextResponse.redirect(new URL(`/api/logistics/newebpay/store-map?ship_type=${encodeURIComponent(shipType)}&lgs_type=C2C`, request.url));
  }
  const shop = await getCurrentShop();
  const returnPath = '/api/logistics/cvs-map/return';
  const returnUrl = shop && !isPlatformShop(shop) ? shopUrl(shop.slug, returnPath) : `${getConfiguredSiteUrl()}${returnPath}`;
  const page = url.searchParams.get('m') === '1' ? 'c2cemapm-u.ashx' : 'c2cemap.ashx';
  return NextResponse.redirect(`https://emap.presco.com.tw/${page}?eshopid=870&servicetype=1&url=${encodeURIComponent(returnUrl)}`);
}
