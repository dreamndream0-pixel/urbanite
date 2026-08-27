'use client';

import { useMemo, useState } from 'react';

type CartItem = {
  id: string;
  name: string;
  variant: string;
  price: number;
  quantity: number;
};

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const products = [
  {
    id: 'love-set',
    name: 'LOVE LOVE LOVE 禮盒',
    tagline: '晚安前的小儀式，柔軟、香氣與心意一次備齊。',
    price: 1680,
    originalPrice: 1980,
    inventory: 38,
    status: '上架中',
    image:
      'https://images.unsplash.com/photo-1617325247661-675ab4b64b18?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'silk-slip',
    name: '雲朵緞面睡衣',
    tagline: '輕薄垂墜的日常款，適合單穿或搭配外袍。',
    price: 1280,
    originalPrice: 1480,
    inventory: 24,
    status: '上架中',
    image:
      'https://images.unsplash.com/photo-1592878849122-facb97520f9e?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'scent-card',
    name: '月光香氛卡',
    tagline: '放進衣櫃、抽屜或禮盒，留下乾淨微甜的香氣。',
    price: 320,
    originalPrice: 380,
    inventory: 91,
    status: '加購品',
    image:
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=80',
  },
];

const orders = [
  { id: 'GG-24081', name: '林小姐', total: 2320, status: '待出貨', paid: '已付款' },
  { id: 'GG-24080', name: 'Chen A.', total: 1680, status: '備貨中', paid: '已付款' },
  { id: 'GG-24079', name: '王小姐', total: 3760, status: '已出貨', paid: '已付款' },
];

const sizes = ['XS', 'S', 'M', 'L'];
const colors = ['Rose', 'Ivory', 'Black'];

export default function Home() {
  const [view, setView] = useState<'shop' | 'admin'>('shop');
  const [size, setSize] = useState('S');
  const [color, setColor] = useState('Rose');
  const [quantity, setQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([
    {
      id: 'scent-card-Rose',
      name: '月光香氛卡',
      variant: 'Rose',
      price: 320,
      quantity: 1,
    },
  ]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = subtotal >= 2000 ? 0 : 120;
  const total = subtotal + shipping;

  const currentProduct = products[0];
  const relatedProducts = products.slice(1);

  function addMainProduct() {
    const id = `${currentProduct.id}-${size}-${color}`;
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }

      return [
        ...items,
        {
          id,
          name: currentProduct.name,
          variant: `${color} / ${size}`,
          price: currentProduct.price,
          quantity,
        },
      ];
    });
    setCartOpen(true);
  }

  function addRelatedProduct(product: (typeof products)[number]) {
    const id = `${product.id}-default`;
    setCart((items) => {
      const existing = items.find((item) => item.id === id);
      if (existing) {
        return items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...items,
        {
          id,
          name: product.name,
          variant: '標準款',
          price: product.price,
          quantity: 1,
        },
      ];
    });
    setCartOpen(true);
  }

  function updateCart(id: string, change: number) {
    setCart((items) =>
      items
        .map((item) => ({ ...item, quantity: Math.max(0, item.quantity + change) }))
        .filter((item) => item.id !== id || item.quantity > 0),
    );
  }

  const adminStats = useMemo(
    () => [
      { label: '今日營收', value: formatter.format(17420), note: '+18%' },
      { label: '待處理訂單', value: '12', note: '5 筆需備貨' },
      { label: '庫存預警', value: '3', note: 'S 碼熱賣' },
      { label: '購物車轉換', value: '42%', note: '+6.4%' },
    ],
    [],
  );

  return (
    <main className="min-h-screen bg-[#fff8f4] text-[#251b1f]">
      <header className="sticky top-0 z-30 border-b border-[#ead8d1] bg-[#fffaf7]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button className="text-left" onClick={() => setView('shop')} aria-label="回到商店首頁">
            <span className="block text-lg font-semibold tracking-[0.18em]">GOODNIGHT GIRLS</span>
            <span className="block text-xs text-[#80666b]">soft goods boutique</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="rounded-full border border-[#ead8d1] bg-white p-1">
              {(['shop', 'admin'] as const).map((tab) => (
                <button
                  key={tab}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    view === tab ? 'bg-[#251b1f] text-white' : 'text-[#6c565b] hover:bg-[#f7ebe6]'
                  }`}
                  onClick={() => setView(tab)}
                >
                  {tab === 'shop' ? '前台' : '後台'}
                </button>
              ))}
            </div>
            <button
              className="relative rounded-full bg-[#c84767] px-4 py-2 text-sm font-semibold text-white shadow-sm"
              onClick={() => setCartOpen(true)}
            >
              購物車
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs text-[#c84767]">
                {cartCount}
              </span>
            </button>
          </div>
        </nav>
      </header>

      {view === 'shop' ? (
        <ShopView
          color={color}
          currentProduct={currentProduct}
          onAdd={addMainProduct}
          onAddRelated={addRelatedProduct}
          quantity={quantity}
          relatedProducts={relatedProducts}
          setColor={setColor}
          setQuantity={setQuantity}
          setSize={setSize}
          size={size}
        />
      ) : (
        <AdminView adminStats={adminStats} />
      )}

      <CartDrawer
        cart={cart}
        open={cartOpen}
        shipping={shipping}
        subtotal={subtotal}
        total={total}
        onClose={() => setCartOpen(false)}
        onUpdate={updateCart}
      />
    </main>
  );
}

function ShopView({
  color,
  currentProduct,
  onAdd,
  onAddRelated,
  quantity,
  relatedProducts,
  setColor,
  setQuantity,
  setSize,
  size,
}: {
  color: string;
  currentProduct: (typeof products)[number];
  onAdd: () => void;
  onAddRelated: (product: (typeof products)[number]) => void;
  quantity: number;
  relatedProducts: typeof products;
  setColor: (color: string) => void;
  setQuantity: (quantity: number) => void;
  setSize: (size: string) => void;
  size: string;
}) {
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:py-12">
        <div className="grid gap-3 sm:grid-cols-[96px_1fr]">
          <div className="order-2 grid grid-cols-3 gap-3 sm:order-1 sm:grid-cols-1">
            {[currentProduct.image, ...relatedProducts.map((item) => item.image)].map((image, index) => (
              <button
                key={image}
                className="aspect-square overflow-hidden rounded-lg border border-[#ead8d1] bg-white"
                aria-label={`商品圖片 ${index + 1}`}
              >
                <img className="h-full w-full object-cover" src={image} alt="" />
              </button>
            ))}
          </div>
          <div className="order-1 overflow-hidden rounded-[22px] bg-[#ead8d1] sm:order-2">
            <img
              className="h-full min-h-[440px] w-full object-cover"
              src={currentProduct.image}
              alt="LOVE LOVE LOVE 禮盒商品主圖"
            />
          </div>
        </div>

        <article className="flex flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#c84767]">限定組合</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-6xl">LOVE LOVE LOVE</h1>
          <p className="mt-4 text-lg leading-8 text-[#6c565b]">{currentProduct.tagline}</p>

          <div className="mt-5 flex items-end gap-3">
            <span className="text-3xl font-semibold">{formatter.format(currentProduct.price)}</span>
            <span className="pb-1 text-lg text-[#9b8588] line-through">
              {formatter.format(currentProduct.originalPrice)}
            </span>
          </div>

          <div className="mt-7 space-y-5">
            <Picker label="顏色" options={colors} value={color} onChange={setColor} />
            <Picker label="尺寸" options={sizes} value={size} onChange={setSize} />

            <div>
              <p className="mb-2 text-sm font-semibold">數量</p>
              <div className="inline-flex items-center rounded-full border border-[#d7b9b0] bg-white">
                <button className="px-4 py-3 text-xl" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  -
                </button>
                <span className="w-10 text-center font-semibold">{quantity}</span>
                <button className="px-4 py-3 text-xl" onClick={() => setQuantity(quantity + 1)}>
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            className="mt-7 rounded-full bg-[#251b1f] px-7 py-4 text-base font-semibold text-white shadow-[0_16px_35px_rgba(37,27,31,0.18)] transition hover:bg-[#3d2a31]"
            onClick={onAdd}
          >
            加入購物車
          </button>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {['滿 NT$2,000 免運', '私密包裝出貨', '7 日客服協助'].map((item) => (
              <div key={item} className="rounded-lg border border-[#ead8d1] bg-white/70 px-4 py-3 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="border-y border-[#ead8d1] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-[#c84767]">商品內容</p>
            <h2 className="mt-2 text-3xl font-semibold">像原頁一樣清楚好買</h2>
          </div>
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            {['禮盒、睡衣、香氛卡與祝福卡', '顏色與尺寸變體選擇', '加購推薦與即時購物車', '折扣、運費與訂單摘要'].map((item) => (
              <div key={item} className="rounded-lg bg-[#fff8f4] p-5 text-[#5f4b50]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#c84767]">一起帶走</p>
            <h2 className="text-3xl font-semibold">推薦加購</h2>
          </div>
          <a className="text-sm font-semibold text-[#6c565b]" href="#checkout">
            查看結帳區
          </a>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {relatedProducts.map((product) => (
            <div key={product.id} className="grid overflow-hidden rounded-xl border border-[#ead8d1] bg-white sm:grid-cols-[180px_1fr]">
              <img className="h-56 w-full object-cover sm:h-full" src={product.image} alt={product.name} />
              <div className="flex flex-col justify-between p-5">
                <div>
                  <p className="text-sm font-semibold text-[#c84767]">{product.status}</p>
                  <h3 className="mt-1 text-xl font-semibold">{product.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6c565b]">{product.tagline}</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-semibold">{formatter.format(product.price)}</span>
                  <button className="rounded-full bg-[#c84767] px-4 py-2 text-sm font-semibold text-white" onClick={() => onAddRelated(product)}>
                    加購
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={`min-w-16 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              value === option
                ? 'border-[#251b1f] bg-[#251b1f] text-white'
                : 'border-[#d7b9b0] bg-white text-[#5f4b50] hover:border-[#c84767]'
            }`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function CartDrawer({
  cart,
  open,
  shipping,
  subtotal,
  total,
  onClose,
  onUpdate,
}: {
  cart: CartItem[];
  open: boolean;
  shipping: number;
  subtotal: number;
  total: number;
  onClose: () => void;
  onUpdate: (id: string, change: number) => void;
}) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[#ead8d1] bg-white shadow-2xl transition-transform duration-300 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between border-b border-[#ead8d1] px-5 py-4">
        <h2 className="text-xl font-semibold">購物車</h2>
        <button className="rounded-full border border-[#ead8d1] px-3 py-1 text-sm" onClick={onClose}>
          關閉
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-5">
        {cart.length === 0 ? (
          <p className="rounded-lg bg-[#fff8f4] p-5 text-[#6c565b]">購物車目前是空的。</p>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="rounded-lg border border-[#ead8d1] p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{item.name}</h3>
                  <p className="mt-1 text-sm text-[#80666b]">{item.variant}</p>
                </div>
                <span className="font-semibold">{formatter.format(item.price * item.quantity)}</span>
              </div>
              <div className="mt-4 inline-flex items-center rounded-full border border-[#ead8d1]">
                <button className="px-3 py-1" onClick={() => onUpdate(item.id, -1)}>
                  -
                </button>
                <span className="w-8 text-center text-sm">{item.quantity}</span>
                <button className="px-3 py-1" onClick={() => onUpdate(item.id, 1)}>
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div id="checkout" className="border-t border-[#ead8d1] p-5">
        <div className="space-y-2 text-sm">
          <Row label="小計" value={formatter.format(subtotal)} />
          <Row label="運費" value={shipping === 0 ? '免運' : formatter.format(shipping)} />
          <Row label="總計" value={formatter.format(total)} strong />
        </div>
        <div className="mt-4 grid gap-3">
          <input className="rounded-lg border border-[#ead8d1] px-4 py-3" placeholder="Email" />
          <input className="rounded-lg border border-[#ead8d1] px-4 py-3" placeholder="收件人姓名" />
          <button className="rounded-full bg-[#251b1f] px-5 py-3 font-semibold text-white">送出訂單</button>
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'pt-2 text-lg font-semibold' : 'text-[#6c565b]'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function AdminView({ adminStats }: { adminStats: { label: string; value: string; note: string }[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#c84767]">Admin</p>
          <h1 className="mt-2 text-4xl font-semibold">商店後台</h1>
          <p className="mt-2 text-[#6c565b]">管理商品、庫存、訂單與首頁活動。</p>
        </div>
        <button className="rounded-full bg-[#251b1f] px-5 py-3 text-sm font-semibold text-white">新增商品</button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {adminStats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[#ead8d1] bg-white p-5">
            <p className="text-sm text-[#80666b]">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
            <p className="mt-2 text-sm font-medium text-[#c84767]">{stat.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="訂單管理" action="匯出 CSV">
          <div className="overflow-hidden rounded-lg border border-[#ead8d1]">
            {orders.map((order) => (
              <div key={order.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 border-b border-[#ead8d1] bg-white px-4 py-4 last:border-b-0">
                <div>
                  <p className="font-semibold">{order.id}</p>
                  <p className="text-sm text-[#80666b]">{order.name}</p>
                </div>
                <div>
                  <p className="font-semibold">{formatter.format(order.total)}</p>
                  <p className="text-sm text-[#80666b]">{order.paid}</p>
                </div>
                <span className="rounded-full bg-[#fff1ed] px-3 py-1 text-sm font-semibold text-[#c84767]">
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="商品與庫存" action="同步庫存">
          <div className="space-y-3">
            {products.map((product) => (
              <div key={product.id} className="flex items-center gap-4 rounded-lg border border-[#ead8d1] bg-white p-3">
                <img className="h-16 w-16 rounded-md object-cover" src={product.image} alt="" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{product.name}</p>
                  <p className="text-sm text-[#80666b]">庫存 {product.inventory} / {product.status}</p>
                </div>
                <button className="rounded-full border border-[#d7b9b0] px-3 py-2 text-sm font-semibold">編輯</button>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="首頁活動設定" action="預覽前台" className="mt-6">
        <div className="grid gap-4 md:grid-cols-3">
          {['主打商品：LOVE LOVE LOVE', '活動文案：滿額免運', '折扣碼：GOODNIGHT10'].map((item) => (
            <label key={item} className="block rounded-lg border border-[#ead8d1] bg-white p-4">
              <span className="text-sm font-semibold text-[#80666b]">{item.split('：')[0]}</span>
              <input className="mt-2 w-full rounded-md border border-[#ead8d1] px-3 py-2" defaultValue={item.split('：')[1]} />
            </label>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[#ead8d1] bg-[#fffdfb] p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button className="rounded-full border border-[#d7b9b0] bg-white px-3 py-2 text-sm font-semibold text-[#5f4b50]">
          {action}
        </button>
      </div>
      {children}
    </section>
  );
}
