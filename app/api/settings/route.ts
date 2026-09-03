import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { SiteSettings } from '@/lib/types';

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
  payment_methods: ['綠界金流', 'Line Pay', 'Apple Pay', '取貨付款', '轉帳匯款'],
  shipping_methods: ['綠界物流-超商取貨', '綠界物流-宅配', '7-11 取貨付款', '全家 取貨付款'],
  enabled_payment_methods: ['綠界金流', 'Line Pay', 'Apple Pay', '取貨付款', '轉帳匯款'],
  enabled_shipping_methods: ['綠界物流-超商取貨', '綠界物流-宅配', '7-11 取貨付款', '全家 取貨付款'],
  payment_accounts: [],
  return_info: '',
};

// GET /api/settings — 取得網站設定(前台與後台共用,公開)
export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .single();

  return NextResponse.json({ ...DEFAULT_SETTINGS, ...(data ?? {}) } as SiteSettings, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

// PATCH /api/settings — 更新網站設定(限管理員)
export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const update: Record<string, unknown> = {
    id: 1,
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
    'return_info',
  ] as const;

  for (const key of keys) {
    if (key in body) update[key] = body[key];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('site_settings')
    .upsert(update)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ...DEFAULT_SETTINGS, ...data } as SiteSettings);
}
