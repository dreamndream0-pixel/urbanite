import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin, getSessionUser } from '@/lib/supabase/server';
import { getOwnedCard, getPlanInfo } from '@/lib/card-access';
import { tierRank } from '@/lib/card-plan';
import { RESERVED_SHOP_SLUGS, SHOP_SLUG_PATTERN, shopUrl } from '@/lib/shop';
import { resolveSiteTheme, SITE_TEMPLATES } from '@/lib/site-theme';
import { limitedFormData } from '@/lib/limited-form';
import { sanitizeImage } from '@/lib/safe-image';

const LOGO_FORMATS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export const dynamic = 'force-dynamic';

// 網址代稱能不能用
async function slugProblem(slug: string, userId?: string) {
  if (!SHOP_SLUG_PATTERN.test(slug)) return '網址只能用小寫英文、數字、連字號,3–30 字,開頭結尾不能是連字號';
  if (RESERVED_SHOP_SLUGS.has(slug)) return '這個網址是系統保留字,請換一個';
  const db = createAdminClient();
  const { data, error } = await db.from('shops').select('id').eq('slug', slug).maybeSingle();
  const card = await db.from('profile_cards').select('owner_user_id').eq('business_identity', true).eq('slug', slug).maybeSingle();
  if (error || card.error) return '暫時無法檢查網址，請稍後再試';
  if (card.data && card.data.owner_user_id !== userId) return '這個網址已經有人使用';
  return data ? '這個網址已經有人使用' : '';
}

// 開店資格:U Pro / U Max(含限時免費期間),或平台管理員
async function eligibility() {
  const user = await getSessionUser();
  if (!user) return { user: null, ok: false, reason: '請先登入' };
  if (await getPlatformAdmin()) return { user, ok: true, reason: '' };
  const plan = await getPlanInfo(user);
  if (tierRank(plan.tier) >= tierRank('pro')) return { user, ok: true, reason: '' };
  return { user, ok: false, reason: '開設官網需要 U Pro 以上方案' };
}

// GET /api/shops?slug=xxx — 檢查網址代稱;不帶參數 = 我的店
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (slug !== null) {
    const s = slug.trim().toLowerCase();
    const problem = await slugProblem(s, (await getSessionUser())?.id);
    return NextResponse.json({ ok: !problem, problem, url: problem ? '' : shopUrl(s) });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ shops: [] });
  const { data: members } = await createAdminClient().from('shop_members').select('role, shop:shops(*)').eq('user_id', user.id);
  return NextResponse.json({ shops: (members ?? []).map((m) => ({ ...(m.shop as object), role: m.role })) });
}

// POST /api/shops { name, slug, template, bank } — 開店
// 也接受 multipart:data = 上面的 JSON,logo = Logo 圖片(選填,PNG 保留透明背景)
export async function POST(request: Request) {
  const { user, ok, reason } = await eligibility();
  if (!user) return NextResponse.json({ error: reason }, { status: 401 });
  if (!ok) return NextResponse.json({ error: reason, upgrade: true }, { status: 403 });
  const card = await getOwnedCard(user);
  if (!card || card.onboarded === false) return NextResponse.json({ error: '請先確認店家名稱與網址', setup: true }, { status: 409 });

  let body: Record<string, unknown> = {};
  let logo: File | null = null;
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    let form: FormData;
    try { form = await limitedFormData(request, 4 * 1024 * 1024); }
    catch { return NextResponse.json({ error: 'Logo 太大,請換小一點的圖片(3MB 以內)' }, { status: 400 }); }
    try { body = JSON.parse(String(form.get('data') ?? '{}')); } catch { body = {}; }
    const f = form.get('logo');
    if (f instanceof File && f.size > 0) logo = f;
  } else {
    body = await request.json().catch(() => ({}));
  }
  if (logo && (!LOGO_FORMATS[logo.type] || logo.size > 3 * 1024 * 1024)) return NextResponse.json({ error: 'Logo 請用 PNG / JPG / WEBP,3MB 以內' }, { status: 400 });
  let logoBytes: Buffer | null = null;
  if (logo) {
    try { logoBytes = await sanitizeImage(new Uint8Array(await logo.arrayBuffer()), logo.type); }
    catch { return NextResponse.json({ error: 'Logo 圖片格式無效或內容損壞' }, { status: 400 }); }
  }
  const name = String(body.name ?? '').trim().slice(0, 40);
  const slug = String(body.slug ?? '').trim().toLowerCase();
  const bank = String(body.bank ?? '').trim().slice(0, 300);
  if (!name) return NextResponse.json({ error: '請輸入店名' }, { status: 400 });
  if (card.business_identity && (name !== card.display_name || slug !== card.slug)) return NextResponse.json({ error: '請沿用已確認的店家名稱與網址；需要修改請到名片設定' }, { status: 409 });
  const problem = await slugProblem(slug, user.id);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const supabase = createAdminClient();
  // 一個帳號先開一家店(平台管理員不限)
  if (!(await getPlatformAdmin())) {
    const { count } = await supabase.from('shop_members').select('shop_id', { count: 'exact', head: true }).eq('user_id', user.id).eq('role', 'owner');
    if ((count ?? 0) > 0) return NextResponse.json({ error: '你已經有一家店了' }, { status: 400 });
  }

  const { data: shop, error } = await supabase.from('shops').insert({ slug, name, owner_user_id: user.id, plan: 'pro', status: 'active' }).select().single();
  if (error || !shop) return NextResponse.json({ error: error?.message.includes('duplicate') ? '這個網址已經有人使用' : error?.message ?? '開店失敗' }, { status: 400 });

  const tpl = SITE_TEMPLATES.find((t) => t.key === body.template) ?? SITE_TEMPLATES[0];
  // Logo:放公開的 assets(每家店自己的資料夾);上傳失敗不擋開店,之後可在後台再傳
  let logoUrl = '';
  if (logo && logoBytes) {
    const path = `shops/${shop.id}/logo-${Date.now()}.${LOGO_FORMATS[logo.type]}`;
    const { error: upErr } = await supabase.storage.from('assets').upload(path, logoBytes, { contentType: logo.type, upsert: true });
    if (!upErr) logoUrl = supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
  }
  const steps = await Promise.all([
    supabase.from('shop_members').insert({ shop_id: shop.id, user_id: user.id, role: 'owner' }),
    // 網站設定:U Pro 只開轉帳匯款、宅配(自行寄件)
    supabase.from('site_settings').insert({
      shop_id: shop.id,
      logo_url: logoUrl,
      footer_company_name: name,
      footer_email: user.email ?? '',
      site_theme: resolveSiteTheme({ template: tpl.key, colors: tpl.colors, layout: tpl.layout }),
      payment_methods: ['轉帳匯款'],
      enabled_payment_methods: ['轉帳匯款'],
      payment_accounts: bank ? [{ name: '轉帳匯款', info: bank }] : [],
      shipping_methods: ['宅配到府'],
      enabled_shipping_methods: ['宅配到府'],
      shipping_fees: [{ name: '宅配到府', fee: 100 }],
      footer_sections: [],
    }),
  ]);
  const failed = steps.find((s) => s.error);
  if (failed?.error) {
    // 沒建完整就整家店拿掉,讓使用者可以重試同一個網址
    await supabase.from('shop_members').delete().eq('shop_id', shop.id);
    await supabase.from('site_settings').delete().eq('shop_id', shop.id);
    await supabase.from('shops').delete().eq('id', shop.id);
    return NextResponse.json({ error: `開店失敗:${failed.error.message}` }, { status: 400 });
  }
  return NextResponse.json({ shop, url: shopUrl(slug), adminUrl: shopUrl(slug, '/admin'), logo: Boolean(logoUrl), logoFailed: Boolean(logo && !logoUrl) }, { status: 201 });
}
