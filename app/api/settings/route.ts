import { NextResponse } from 'next/server';
import { resolvePromoNotices } from '@/lib/promo-notices';
import { getAdminUser } from '@/lib/supabase/server';
import type { SiteSettings } from '@/lib/types';
import { revalidateTag } from 'next/cache';
import { resolveSiteTheme } from '@/lib/site-theme';
import { draftSiteTheme } from '@/lib/site-theme-state';
import { getCurrentShop, isPlatformShop, shopAdminClient } from '@/lib/shop';

const DEFAULT_SETTINGS: SiteSettings = {
  id: 1,
  logo_url: '',
  footer_about_links: ['優惠資訊 / Coupon', '商店介紹 / Introduction', '與我們合作 / Cooperation'],
  footer_service_links: [
    '加入會員享折扣 / VIP',
    '挑選尺寸 / About Size',
    '購物須知 / How To Buy',
    '退換貨政策 / After-sales Service',
    '使用者條款 / Terms',
    '隱私權政策 / Privacy',
  ],
  footer_sections: [],
  footer_service_hours: '上班日 11:00 - 18:00',
  footer_email: '',
  footer_company_name: '',
  footer_tax_id: '',
  footer_instagram_url: '',
  footer_line_url: '',
  payment_methods: ['信用卡付款', 'Apple Pay', '轉帳匯款'],
  shipping_methods: ['全家取貨付款', '全家取貨不付款', '7-11取貨付款', '7-11取貨不付款', '宅配到府'],
  enabled_payment_methods: ['信用卡付款', '轉帳匯款'],
  enabled_shipping_methods: ['全家取貨付款', '全家取貨不付款', '7-11取貨付款', '7-11取貨不付款', '宅配到府'],
  payment_accounts: [],
  shipping_fees: [],
  return_info: '',
  coupon_hero_image: '',
  member_stamp_image: '',
};

// GET /api/settings — 取得網站設定(前台與後台共用,公開)
export async function GET() {
  const supabase = (await shopAdminClient());
  const { data } = await supabase
    .from('site_settings')
    .select('*')
    .single();

  const shop = await getCurrentShop();
  const shopInfo = { shop_name: shop?.name ?? '', shop_slug: shop?.slug ?? '', platform: isPlatformShop(shop) };
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...(data ?? {}), site_theme: resolveSiteTheme(data?.site_theme), ...shopInfo } as SiteSettings, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

// PATCH /api/settings — 更新網站設定(限管理員)
export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  if ('site_theme_draft' in body && 'site_theme' in body) return NextResponse.json({ error: '請分別儲存草稿或發布' }, { status: 400 });
  // 每家店一筆網站設定(以 shop_id 判斷新增或更新)
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const keys = [
    'footer_about_links',
    'footer_service_links',
    'footer_sections',
    'footer_service_hours',
    'footer_email',
    'footer_company_name',
    'footer_tax_id',
    'footer_instagram_url',
    'footer_line_url',
    'payment_methods',
    'shipping_methods',
    'enabled_payment_methods',
    'enabled_shipping_methods',
    'payment_accounts',
    'shipping_fees',
    'return_info',
    'coupon_hero_image',
    'member_stamp_image',
    'site_theme',
    'promo_notices',
  ] as const;

  for (const key of keys) {
    if (key in body) update[key] = body[key];
  }
  // 網站外觀:只保留合法的顏色與選項
  if ('site_theme' in body) update.site_theme = resolveSiteTheme(body.site_theme);
  if ('promo_notices' in body) update.promo_notices = resolvePromoNotices(body.promo_notices);
  if ('category_image_style' in body) update.category_image_style = ['text', 'square', 'cutout'].includes(String(body.category_image_style)) ? String(body.category_image_style) : 'circle';

  const supabase = (await shopAdminClient());
  if ('site_theme_draft' in body) {
    const { data: current, error: readError } = await supabase.from('site_settings').select('site_theme').maybeSingle();
    if (readError) return NextResponse.json({ error: '無法讀取目前官網設定，草稿未儲存' }, { status: 500 });
    update.site_theme = draftSiteTheme(current?.site_theme, body.site_theme_draft);
  }
  const { data, error } = await supabase
    .from('site_settings')
    .upsert(update, { onConflict: 'shop_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if ('site_theme' in body) revalidateTag('site-theme', { expire: 0 });
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...data } as SiteSettings);
}
