// 前後端共用的資料型別

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
  is_featured: boolean;
  sort_order: number;
  created_at?: string;
};

export type SiteSettings = {
  id: number;
  logo_url: string;
  footer_about_links?: string[];
  footer_service_links?: string[];
  footer_service_hours?: string;
  footer_email?: string;
  footer_company_name?: string;
  footer_tax_id?: string;
  footer_instagram_url?: string;
  footer_line_url?: string;
  payment_methods?: string[];
  shipping_methods?: string[];
  updated_at?: string;
};

export type Discount = {
  id: string;
  code: string;
  type: string; // percent | amount
  value: number;
  min_spend: number;
  active: boolean;
  created_at?: string;
};

export type Customer = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  created_at?: string;
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
  total: number;
  status: string;
  paid: boolean;
  user_id?: string | null;
  created_at?: string;
};
