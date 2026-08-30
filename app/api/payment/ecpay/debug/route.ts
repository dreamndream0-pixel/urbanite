import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getEcpayConfig } from '@/lib/ecpay';

// GET /api/payment/ecpay/debug — 檢查正式站實際載入的綠界設定(限管理員)
// 只回傳環境、端點、MerchantID、以及 HashKey/HashIV 的「長度與頭尾遮罩」,不外洩完整金鑰。
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權(請先以管理員身分登入)' }, { status: 401 });

  const cfg = getEcpayConfig();
  const mask = (s: string) => {
    const t = s ?? '';
    const len = t.length;
    const hasSpace = /\s/.test(t); // 前後或中間有空白/換行 → 貼錯
    const head = t.slice(0, 2);
    const tail = t.slice(-2);
    return { length: len, hasWhitespace: hasSpace, preview: len ? `${head}…${tail}` : '(空)' };
  };

  return NextResponse.json({
    env: cfg.isProd ? 'production' : 'stage',
    endpoint: cfg.aioUrl,
    merchantId: cfg.merchantId,
    choosePayment: cfg.choosePayment,
    hashKey: mask(cfg.hashKey), // 綠界 HashKey 正式通常為 16 碼
    hashIv: mask(cfg.hashIv), //  綠界 HashIV 正式通常為 16 碼
    note: 'HashKey/HashIV 應各為 16 碼、hasWhitespace 應為 false;若長度不對或有空白即為貼錯。',
  });
}
