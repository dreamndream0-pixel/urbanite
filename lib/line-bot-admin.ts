// 後台 LINE 機器人 API 共用:驗證後台權限(主站管理員 / 店主、店員),並以目前網域的店家執行。
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, isPlatformShop, type Shop } from '@/lib/shop';
import { LINE_BOT_SCHEMA_ERROR, lineBotDb, runAsShop } from '@/lib/line-channel';

export type LineBotAdminContext = { admin: User; shop: Shop; platform: boolean; db: SupabaseClient };

export async function withLineBotAdmin(fn: (ctx: LineBotAdminContext) => Promise<Response>): Promise<Response> {
  const [admin, shop] = await Promise.all([getAdminUser(), getCurrentShop()]);
  if (!admin || !shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const platform = isPlatformShop(shop);
  return runAsShop(platform ? null : shop, async () => {
    try {
      const db = await lineBotDb();
      return await fn({ admin, shop, platform, db });
    } catch (e) {
      const message = e instanceof Error ? e.message : '操作失敗';
      return NextResponse.json({ error: message }, { status: message === LINE_BOT_SCHEMA_ERROR ? 503 : 400 });
    }
  });
}
