import { NextResponse } from 'next/server';
import { pickupStoreErrorPage, pickupStorePage } from '@/lib/pickup-store-page';

const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

// 7-11 電子地圖選完門市後 POST 回來:storeid / storename / storeaddress
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => String(form?.get(name) ?? '').trim().slice(0, 200);
  const storeId = field('storeid');
  if (!/^\d{4,8}$/.test(storeId)) {
    return new NextResponse(pickupStoreErrorPage('未取得門市資料,請重新選擇'), { status: 400, headers: HTML });
  }
  return new NextResponse(pickupStorePage({
    store_id: storeId,
    store_name: field('storename'),
    store_phone: '',
    store_address: field('storeaddress'),
    store_ship_type: '1',
    store_lgs_type: 'C2C',
  }), { headers: HTML });
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/checkout', request.url));
}
