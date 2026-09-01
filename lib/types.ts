// 前後端共用的資料型別

// 規格維度(例:{name:'顏色', options:['紅','綠','藍']})
export type SpecDim = { name: string; options: string[] };
// 每個規格組合的庫存(options 依 specs 順序,例:['紅','S'])
export type Variant = {
  options: string[];
  inventory: number;
  cost?: number; // 單位成本
  safety?: number; // 安全庫存
  location?: string; // 儲位
};

// 進出庫紀錄
export type StockMovement = {
  id: string;
  product_id: string;
  variant_key: string;
  type: 'in' | 'out';
  quantity: number;
  unit_price: number;
  location: string;
  handler: string;
  note: string;
  created_at?: string;
};

export type Product = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  original_price: number | null;
  inventory: number;
  status: string;
  category: string;
  image: string;
  images: string[];
  available_payment_methods?: string[];
  available_shipping_methods?: string[];
  colors: string[];
  sizes: string[];
  specs: SpecDim[];
  variants: Variant[];
  unit?: string;
  sale_mode?: string; // 現貨 / 預購 / 預購+現貨
  is_featured: boolean;
  sort_order: number;
  created_at?: string;
};

export type SiteSettings = {
  id: number;
  logo_url: string;
  footer_about_links?: string[];
  footer_service_links?: string[];
  footer_sections?: { title: string; items: { subtitle: string; content: string; url: string }[] }[];
  footer_service_hours?: string;
  footer_email?: string;
  footer_company_name?: string;
  footer_tax_id?: string;
  footer_instagram_url?: string;
  footer_line_url?: string;
  footer_social_links?: { label: string; image: string; url: string }[];
  payment_methods?: string[];
  shipping_methods?: string[];
  enabled_payment_methods?: string[];
  enabled_shipping_methods?: string[];
  updated_at?: string;
};

export type Discount = {
  id: string;
  name?: string;
  code: string;
  type: 'percent' | 'amount' | 'free_shipping' | string;
  value: number;
  min_spend: number;
  max_discount?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  total_limit?: number | null;
  per_user_limit?: number | null;
  applicable_products?: string[];
  applicable_categories?: string[];
  applicable_users?: 'all' | 'new' | 'vip' | string;
  is_first_purchase_only?: boolean;
  stackable?: boolean;
  status?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Customer = {
  id: string;
  user_id: string;
  email: string;
  phone?: string;
  name: string;
  address?: string;
  created_at?: string;
};

export type UserCoupon = {
  id: string;
  user_id: string;
  coupon_id: string;
  status: 'available' | 'used' | 'expired' | 'revoked' | 'locked';
  received_at?: string;
  used_at?: string | null;
  expired_at?: string | null;
  order_id?: string | null;
  locked_at?: string | null;
  lock_expires_at?: string | null;
  coupon?: Discount;
};

export type CouponUsage = {
  id: string;
  coupon_id: string;
  user_id?: string | null;
  user_coupon_id?: string | null;
  order_id?: string | null;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  used_at?: string;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  en: string;
  sort_order: number;
  created_at?: string;
};

export type Banner = {
  id: string;
  image: string;
  link: string;
  title: string;
  active: boolean;
  sort_order: number;
  created_at?: string;
};

export type OrderItem = {
  name: string;
  variant: string;
  price: number;
  quantity: number;
  productId?: string;
  image?: string;
  original_price?: number | null;
};

export type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  email: string;
  phone?: string;
  address?: string;
  note?: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  shipping_method?: string;
  payment_method?: string;
  discount: number;
  discount_code: string;
  coupon_id?: string | null;
  user_coupon_id?: string | null;
  coupon_snapshot?: Record<string, unknown> | null;
  total: number;
  status: string;
  paid: boolean;
  user_id?: string | null;
  created_at?: string;
};
