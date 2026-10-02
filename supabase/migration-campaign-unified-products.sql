-- =============================================================
-- 活動商品併入主站商品表(products.campaign_id)
-- 活動頁、商品頁、後台商品表單、庫存/進出庫都與主站共用同一套。
-- 需先執行過 migration-campaign-pages.sql。到 Supabase SQL Editor 執行整份；可重複執行。
-- =============================================================

alter table public.products
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

create index if not exists products_campaign_idx on public.products(campaign_id);

-- 舊的 campaign_products 資料搬進 products(商品代碼沿用原 uuid,舊購物車 campaign:<uuid> 仍可對應)
insert into public.products (
  id, campaign_id, name, tagline, price, original_price, inventory, status, category,
  image, images, available_payment_methods, available_shipping_methods, shipping_fee_overrides,
  colors, sizes, specs, variants, unit, sale_mode, color_images, is_featured, sort_order
)
select
  cp.id::text,
  cp.campaign_id,
  cp.name,
  cp.tagline,
  cp.price,
  cp.original_price,
  cp.inventory,
  cp.status,
  coalesce((select c.slug from public.categories c where c.name = cp.category or c.slug = cp.category limit 1), cp.category),
  cp.image,
  cp.images,
  cp.available_payment_methods,
  cp.available_shipping_methods,
  cp.shipping_fee_overrides,
  coalesce((select array(select jsonb_array_elements_text(s->'options')) from jsonb_array_elements(cp.specs) s where s->>'name' ~* '色|color' limit 1), '{}'),
  coalesce((select array(select jsonb_array_elements_text(s->'options')) from jsonb_array_elements(cp.specs) s where s->>'name' ~* '尺寸|size' limit 1), '{}'),
  cp.specs,
  cp.variants,
  cp.unit,
  cp.sale_mode,
  '{}'::jsonb,
  false,
  cp.sort_order
from public.campaign_products cp
on conflict (id) do nothing;
