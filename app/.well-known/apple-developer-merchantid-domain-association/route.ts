import { getIntegration } from '@/lib/integrations';

// Apple Pay 商店網域驗證檔
// 藍新「Apple Pay 幕後支付」開通時需驗證網域:Apple/藍新會抓取
//   https://<你的網域>/.well-known/apple-developer-merchantid-domain-association
// 內容在後台「系統設定 → 串接設定 → Apple Pay 網域驗證檔內容」貼上(未設定時沿用環境變數)。
export const dynamic = 'force-dynamic';

export async function GET() {
  const content = await getIntegration('APPLE_PAY_DOMAIN_ASSOCIATION');
  return new Response(content, {
    status: content ? 200 : 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
