import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin, getSessionUser } from '@/lib/supabase/server';
import { getPlanInfo } from '@/lib/card-access';
import { tierRank } from '@/lib/card-plan';
import { RESERVED_SHOP_SLUGS, SHOP_SLUG_PATTERN, shopUrl } from '@/lib/shop';
import { resolveSiteTheme, SITE_TEMPLATES } from '@/lib/site-theme';

export const dynamic = 'force-dynamic';

// 網址代稱能不能用
async function slugProblem(slug: string) {
  if (!SHOP_SLUG_PATTERN.test(slug)) return '網址只能用小寫英文、數字、連字號,3–30 字,開頭結尾不能是連字號';
  if (RESERVED_SHOP_SLUGS.has(slug)) return '這個網址是系統保留字,請換一個';
  const { data } = await createAdminClient().from('shops').select('id').eq('slug', slug).maybeSingle();
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
    const problem = await slugProblem(s);
    return NextResponse.json({ ok: !problem, problem, url: problem ? '' : shopUrl(s) });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ shops: [] });
  const { data: members } = await createAdminClient().from('shop_members').select('role, shop:shops(*)').eq('user_id', user.id);
  return NextResponse.json({ shops: (members ?? []).map((m) => ({ ...(m.shop as object), role: m.role })) });
}

// POST /api/shops { name, slug, template, bank } — 開店
export async function POST(request: Request) {
  const { user, ok, reason } = await eligibility();
  if (!user) return NextResponse.json({ error: reason }, { status: 401 });
  if (!ok) return NextResponse.json({ error: reason, upgrade: true }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim().slice(0, 40);
  const slug = String(body.slug ?? '').trim().toLowerCase();
  const bank = String(body.bank ?? '').trim().slice(0, 300);
  if (!name) return NextResponse.json({ error: '請輸入店名' }, { status: 400 });
  const problem = await slugProblem(slug);
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
  const steps = await Promise.all([
    supabase.from('shop_members').insert({ shop_id: shop.id, user_id: user.id, role: 'owner' }),
    // 網站設定:U Pro 只開轉帳匯款、宅配(自行寄件)
    supabase.from('site_settings').insert({
      shop_id: shop.id,
      logo_url: '',
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
  return NextResponse.json({ shop, url: shopUrl(slug), adminUrl: shopUrl(slug, '/admin') }, { status: 201 });
}
