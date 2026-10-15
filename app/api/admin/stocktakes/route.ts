import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { linesFromProducts } from '@/lib/stocktake';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/admin/stocktakes — 盤點單列表(最新 100 筆)
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const db = await shopAdminClient();
  const { data, error } = await db.from('stocktakes').select('*').neq('status', 'void').order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/stocktakes { category?: 'all' | slug, title?, handler?, note? } — 建立盤點單,拍下目前系統庫存
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const category = String(body?.category ?? 'all');
  const db = await shopAdminClient();

  let query = db.from('products').select('*').order('id', { ascending: true });
  if (category !== 'all') query = query.eq('category', category);
  const { data: products, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lines = linesFromProducts((products ?? []) as Product[]);
  if (!lines.length) return NextResponse.json({ error: '這個範圍沒有商品可以盤點' }, { status: 400 });

  let scope = '全部商品';
  if (category !== 'all') {
    const { data: cat } = await db.from('categories').select('name').eq('slug', category).maybeSingle();
    scope = `分類:${cat?.name || category}`;
  }

  // 單號 ST + 台灣日期 + 流水號
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()).replace(/-/g, '');
  const prefix = `ST${ymd}`;
  const { count } = await db.from('stocktakes').select('id', { count: 'exact', head: true }).like('doc_no', `${prefix}%`);
  const docNo = `${prefix}${String((count ?? 0) + 1).padStart(3, '0')}`;

  const { data, error: insErr } = await db.from('stocktakes').insert({
    doc_no: docNo,
    title: String(body?.title ?? '').trim() || `${scope}盤點`,
    scope,
    handler: String(body?.handler ?? '').trim(),
    note: String(body?.note ?? '').trim(),
    lines,
  }).select().single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
