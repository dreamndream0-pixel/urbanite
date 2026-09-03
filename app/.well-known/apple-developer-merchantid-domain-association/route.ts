// Apple Pay 商店網域驗證檔
// 藍新「Apple Pay 幕後支付」開通時需驗證網域:Apple/藍新會抓取
//   https://<你的網域>/.well-known/apple-developer-merchantid-domain-association
// 請到藍新後台下載驗證檔內容,設為環境變數 APPLE_PAY_DOMAIN_ASSOCIATION。
export const dynamic = 'force-static';

export function GET() {
  const content = process.env.APPLE_PAY_DOMAIN_ASSOCIATION || '';
  return new Response(content, {
    status: content ? 200 : 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
