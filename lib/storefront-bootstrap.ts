import 'server-only';
import { getCurrentShop, isPlatformShop, scopedClient } from './shop';
import { resolveSiteTheme } from './site-theme';
import type { Banner, StorefrontBootstrap } from './types';

// Only public first-screen fields cross the server/client boundary; never the saved template draft.
export async function getStorefrontBootstrap(): Promise<StorefrontBootstrap | null> {
  try {
    const shop = await getCurrentShop();
    if (!shop || shop.status === 'suspended') return null;
    const db = scopedClient(shop.id);
    const [{ data: settings, error: settingsError }, { data: banners, error: bannerError }] = await Promise.all([
      db.from('site_settings').select('id, logo_url, site_theme, category_image_style, free_shipping_threshold').maybeSingle(),
      db.from('banners').select('id, image, link, title, active, sort_order, group_no').eq('active', true).order('sort_order', { ascending: true }),
    ]);
    if (settingsError || bannerError) return null;
    return {
      settings: { id: settings?.id ?? 1, logo_url: settings?.logo_url ?? '', site_theme: resolveSiteTheme(settings?.site_theme), category_image_style: settings?.category_image_style ?? 'circle', free_shipping_threshold: settings?.free_shipping_threshold, shop_name: shop.name, shop_slug: shop.slug, platform: isPlatformShop(shop) },
      banners: (banners ?? []) as Banner[],
    };
  } catch { return null; }
}
