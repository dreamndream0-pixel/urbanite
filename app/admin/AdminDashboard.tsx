'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Category, Order, Product } from '@/lib/types';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const ORDER_STATUSES = ['待出貨', '備貨中', '已出貨', '已取消'];
const PRODUCT_STATUSES = ['上架中', '加購品', '已下架'];

type Draft = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  original_price: number | null;
  inventory: number;
  status: string;
  category: string;
  image: string;
  colors: string;
  sizes: string;
  is_featured: boolean;
  sort_order: number;
};

function blankDraft(): Draft {
  return {
    id: '',
    name: '',
    tagline: '',
    price: 0,
    original_price: null,
    inventory: 0,
    status: '上架中',
    category: '',
    image: '',
    colors: '',
    sizes: '',
    is_featured: false,
    sort_order: 0,
  };
}

function toDraft(p: Product): Draft {
  return { ...p, colors: p.colors.join(', '), sizes: p.sizes.join(', ') };
}

export default function AdminDashboard({
  initialProducts,
  initialOrders,
  initialCategories,
  userEmail,
}: {
  initialProducts: Product[];
  initialOrders: Order[];
  initialCategories: Category[];
  userEmail: string;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [newCat, setNewCat] = useState({ slug: '', name: '', en: '' });
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayRevenue = orders
      .filter((o) => o.created_at && new Date(o.created_at).toDateString() === today)
      .reduce((sum, o) => sum + o.total, 0);
    const pending = orders.filter((o) => o.status === '待出貨').length;
    const lowStock = products.filter((p) => p.inventory <= 10).length;
    return [
      { label: '今日營收', value: formatter.format(todayRevenue) },
      { label: '待出貨訂單', value: String(pending) },
      { label: '商品數', value: String(products.length) },
      { label: '低庫存(≤10)', value: String(lowStock) },
    ];
  }, [orders, products]);

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

  async function updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'paid'>>) {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as Order;
      setOrders((list) => list.map((o) => (o.id === id ? updated : o)));
    } else {
      alert('更新失敗');
    }
  }

  async function saveProduct() {
    if (!editing) return;
    const payload = {
      ...editing,
      colors: editing.colors.split(',').map((s) => s.trim()).filter(Boolean),
      sizes: editing.sizes.split(',').map((s) => s.trim()).filter(Boolean),
    };

    if (isNew) {
      if (!payload.id || !payload.name) {
        alert('請填寫商品代碼與名稱');
        return;
      }
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((list) => [...list, data as Product]);
        setEditing(null);
      } else {
        alert(data.error ?? '新增失敗');
      }
    } else {
      const res = await fetch(`/api/products/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((list) => list.map((p) => (p.id === editing.id ? (data as Product) : p)));
        setEditing(null);
      } else {
        alert(data.error ?? '更新失敗');
      }
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm('確定要刪除這個商品嗎?')) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setProducts((list) => list.filter((p) => p.id !== id));
    } else {
      alert('刪除失敗');
    }
  }

  async function saveNewCategory() {
    const slug = newCat.slug.trim().toLowerCase();
    if (!slug || !newCat.name.trim()) {
      alert('請填寫代碼(英文)與名稱');
      return;
    }
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        name: newCat.name.trim(),
        en: newCat.en.trim() || slug.toUpperCase(),
        sort_order: categories.length + 1,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setCategories((list) => [...list, data as Category]);
      setNewCat({ slug: '', name: '', en: '' });
    } else {
      alert(data.error ?? '新增失敗(代碼可能重複)');
    }
  }

  async function patchCategory(
    id: string,
    patch: Partial<Pick<Category, 'name' | 'en' | 'sort_order'>>,
  ) {
    setCategories((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  async function deleteCategory(id: string) {
    if (!confirm('確定刪除這個分類嗎?(商品不會被刪,只是失去這個分類標籤)')) return;
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCategories((list) => list.filter((c) => c.id !== id));
    } else {
      alert('刪除失敗');
    }
  }

  return (
    <main className="min-h-screen bg-[#fff8f4] text-[#251b1f]">
      <header className="border-b border-[#ead8d1] bg-[#fffaf7]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <span className="block text-lg font-semibold tracking-[0.18em]">後台管理</span>
            <span className="block text-xs text-[#80666b]">{userEmail}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#ead8d1] bg-white px-4 py-2 text-sm font-medium text-[#6c565b] hover:bg-[#f7ebe6]"
            >
              看前台
            </Link>
            <button
              onClick={signOut}
              className="rounded-full bg-[#251b1f] px-4 py-2 text-sm font-semibold text-white"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-[#ead8d1] bg-white p-5">
              <p className="text-sm text-[#80666b]">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* 訂單管理 */}
          <Panel title="訂單管理">
            {orders.length === 0 ? (
              <p className="rounded-lg bg-[#fff8f4] p-5 text-[#6c565b]">目前還沒有訂單。</p>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-[#ead8d1] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{order.order_no}</p>
                        <p className="text-sm text-[#80666b]">
                          {order.customer_name} · {order.email}
                        </p>
                      </div>
                      <span className="font-semibold">{formatter.format(order.total)}</span>
                    </div>
                    <ul className="mt-2 text-sm text-[#6c565b]">
                      {order.items.map((it, i) => (
                        <li key={i}>
                          {it.name} × {it.quantity}（{it.variant}）
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={order.status}
                        onChange={(e) => updateOrder(order.id, { status: e.target.value })}
                        className="rounded-full border border-[#d7b9b0] bg-white px-3 py-1.5 text-sm"
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => updateOrder(order.id, { paid: !order.paid })}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                          order.paid
                            ? 'bg-[#e9f7ee] text-[#1f7a44]'
                            : 'border border-[#d7b9b0] text-[#6c565b]'
                        }`}
                      >
                        {order.paid ? '已付款' : '未付款'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* 商品管理 */}
          <Panel
            title="商品與庫存"
            action={
              <button
                onClick={() => {
                  setEditing(blankDraft());
                  setIsNew(true);
                }}
                className="rounded-full bg-[#251b1f] px-3 py-2 text-sm font-semibold text-white"
              >
                新增商品
              </button>
            }
          >
            <div className="space-y-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-4 rounded-lg border border-[#ead8d1] bg-white p-3"
                >
                  {product.image ? (
                    <img className="h-16 w-16 rounded-md object-cover" src={product.image} alt="" />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-[#f1e3dc]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {product.name}
                      {product.is_featured && (
                        <span className="ml-2 rounded-full bg-[#fff1ed] px-2 py-0.5 text-xs text-[#c84767]">
                          主打
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-[#80666b]">
                      {formatter.format(product.price)} · 庫存 {product.inventory} · {product.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditing(toDraft(product));
                        setIsNew(false);
                      }}
                      className="rounded-full border border-[#d7b9b0] px-3 py-2 text-sm font-semibold"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="rounded-full border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#c0392b]"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title="分類管理(首頁分類選單)">
            <div className="space-y-2">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[#ead8d1] bg-white p-3"
                >
                  <input
                    value={c.en}
                    onChange={(e) =>
                      setCategories((l) =>
                        l.map((x) => (x.id === c.id ? { ...x, en: e.target.value } : x)),
                      )
                    }
                    onBlur={() =>
                      patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })
                    }
                    placeholder="EN"
                    className="w-20 rounded border border-[#ead8d1] px-2 py-1 text-sm"
                  />
                  <input
                    value={c.name}
                    onChange={(e) =>
                      setCategories((l) =>
                        l.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    onBlur={() =>
                      patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })
                    }
                    placeholder="名稱"
                    className="min-w-24 flex-1 rounded border border-[#ead8d1] px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-[#a99e8f]">{c.slug}</span>
                  <input
                    type="number"
                    value={c.sort_order}
                    onChange={(e) =>
                      setCategories((l) =>
                        l.map((x) =>
                          x.id === c.id ? { ...x, sort_order: Number(e.target.value) } : x,
                        ),
                      )
                    }
                    onBlur={() =>
                      patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })
                    }
                    className="w-14 rounded border border-[#ead8d1] px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => deleteCategory(c.id)}
                    className="rounded-full border border-[#e0b4b4] px-3 py-1 text-sm font-semibold text-[#c0392b]"
                  >
                    刪除
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#ead8d1] pt-4">
              <input
                value={newCat.slug}
                onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
                placeholder="代碼(英文,如 dress)"
                className="w-44 rounded border border-[#ead8d1] px-2 py-1.5 text-sm"
              />
              <input
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                placeholder="名稱(如 洋裝)"
                className="w-32 rounded border border-[#ead8d1] px-2 py-1.5 text-sm"
              />
              <input
                value={newCat.en}
                onChange={(e) => setNewCat({ ...newCat, en: e.target.value })}
                placeholder="EN(可空)"
                className="w-24 rounded border border-[#ead8d1] px-2 py-1.5 text-sm"
              />
              <button
                onClick={saveNewCategory}
                className="rounded-full bg-[#251b1f] px-4 py-1.5 text-sm font-semibold text-white"
              >
                新增分類
              </button>
            </div>
          </Panel>
        </div>
      </section>

      {editing && (
        <ProductModal
          draft={editing}
          isNew={isNew}
          categories={categories}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveProduct}
        />
      )}
    </main>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#ead8d1] bg-[#fffdfb] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProductModal({
  draft,
  isNew,
  categories,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  isNew: boolean;
  categories: Category[];
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6">
        <h2 className="text-xl font-semibold">{isNew ? '新增商品' : '編輯商品'}</h2>
        <div className="mt-4 grid gap-3">
          <Field label="商品代碼(英文,新增後不可改)">
            <input
              className="w-full rounded-lg border border-[#ead8d1] px-3 py-2 disabled:bg-[#f5efec]"
              value={draft.id}
              disabled={!isNew}
              onChange={(e) => set('id', e.target.value)}
            />
          </Field>
          <Field label="名稱">
            <input
              className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="介紹">
            <input
              className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
              value={draft.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="售價">
              <input
                type="number"
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.price}
                onChange={(e) => set('price', Number(e.target.value))}
              />
            </Field>
            <Field label="原價(可空)">
              <input
                type="number"
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.original_price ?? ''}
                onChange={(e) =>
                  set('original_price', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="庫存">
              <input
                type="number"
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.inventory}
                onChange={(e) => set('inventory', Number(e.target.value))}
              />
            </Field>
            <Field label="狀態">
              <select
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="分類(首頁篩選用)">
            <select
              className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
              value={draft.category}
              onChange={(e) => set('category', e.target.value)}
            >
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="圖片網址">
            <input
              className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
              value={draft.image}
              onChange={(e) => set('image', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="顏色(逗號分隔)">
              <input
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.colors}
                onChange={(e) => set('colors', e.target.value)}
              />
            </Field>
            <Field label="尺寸(逗號分隔)">
              <input
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.sizes}
                onChange={(e) => set('sizes', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="排序(小的在前)">
              <input
                type="number"
                className="w-full rounded-lg border border-[#ead8d1] px-3 py-2"
                value={draft.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value))}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={draft.is_featured}
                onChange={(e) => set('is_featured', e.target.checked)}
              />
              <span className="text-sm font-semibold">設為首頁主打</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-[#d7b9b0] px-5 py-2 text-sm font-semibold"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="rounded-full bg-[#251b1f] px-5 py-2 text-sm font-semibold text-white"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[#80666b]">{label}</span>
      {children}
    </label>
  );
}
