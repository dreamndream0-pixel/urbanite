import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SiteSettings } from '@/lib/types';

// GET /api/settings — 取得網站設定(前台與後台共用,公開)
export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .single();

  return NextResponse.json((data ?? { id: 1, logo_url: '' }) as SiteSettings);
}
