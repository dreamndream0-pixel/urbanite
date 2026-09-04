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
    // 若是彈出視窗:把門市回傳給結帳頁並自動關閉(結帳頁不換頁);否則(同頁)存 localStorage 後導回。
    return new NextResponse(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>門市已選擇</title></head><body><script>
(function(){
  var store = ${JSON.stringify(json)};
  try { localStorage.setItem('newebpay-pickup-store', store); } catch(e){}
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ type: 'newebpay-pickup-store', store: store }, window.location.origin); } catch(e){}
    window.close();
  } else {
    location.replace('/checkout');
  }
})();
</script><p>已選擇 ${esc(store.store_name)}，可關閉此視窗。</p></body></html>`, {
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
