import { NextResponse } from 'next/server';
import { decodeNewebpayLogisticsResponse } from '@/lib/newebpay-logistics';
import { pickupStoreErrorPage, pickupStorePage } from '@/lib/pickup-store-page';

const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = await decodeNewebpayLogisticsResponse(Object.fromEntries(formData.entries()));
    const store = {
      store_id: String(payload.StoreID ?? ''),
      store_name: String(payload.StoreName ?? ''),
      store_phone: String(payload.StoreTel ?? ''),
      store_address: String(payload.StoreAddr ?? ''),
      store_ship_type: String(payload.ShipType ?? ''),
      store_lgs_type: String(payload.LgsType ?? 'C2C'),
    };
    if (!store.store_id) throw new Error('未取得門市資料');
    return new NextResponse(pickupStorePage(store), { headers: HTML });
  } catch (error) {
    const message = error instanceof Error ? error.message : '門市選擇失敗';
    return new NextResponse(pickupStoreErrorPage(message), { status: 400, headers: HTML });
  }
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/checkout', request.url));
}
