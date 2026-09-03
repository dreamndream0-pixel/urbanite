import { NextResponse } from 'next/server';
import { decodeNewebpayLogisticsResponse } from '@/lib/newebpay-logistics';

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = decodeNewebpayLogisticsResponse(Object.fromEntries(formData.entries()));
    const store = {
      store_id: String(payload.StoreID ?? ''),
      store_name: String(payload.StoreName ?? ''),
      store_phone: String(payload.StoreTel ?? ''),
      store_address: String(payload.StoreAddr ?? ''),
      store_ship_type: String(payload.ShipType ?? ''),
      store_lgs_type: String(payload.LgsType ?? 'C2C'),
    };
    if (!store.store_id) throw new Error('未取得門市資料');
    const json = JSON.stringify(store).replace(/</g, '\\u003c');
    return new NextResponse(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>門市已選擇</title></head><body><p>已選擇 ${esc(store.store_name)}，正在返回結帳頁...</p><script>localStorage.setItem('newebpay-pickup-store', ${JSON.stringify(json)});location.replace('/checkout');</script></body></html>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '門市選擇失敗';
    return new NextResponse(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>門市選擇失敗</title></head><body><p>${esc(message)}</p><p><a href="/checkout">返回結帳頁</a></p></body></html>`, {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/checkout', request.url));
}
