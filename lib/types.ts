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
  colors: string[];
  sizes: string[];
  is_featured: boolean;
  sort_order: number;
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

export type OrderItem = {
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

export type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  email: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: string;
  paid: boolean;
  created_at?: string;
};
