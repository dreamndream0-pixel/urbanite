import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicBusiness, loadSchedule } from '@/lib/booking/server';
import BookingClient from './BookingClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug).toLowerCase());
  const name = ctx ? ctx.business.name || ctx.card.display_name : '線上預約';
  return { title: { absolute: `${name} 線上預約 | URBANLINKS` }, robots: { index: false } };
}

// 名片線上預約頁(對外網址 /@代稱/book)
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug).toLowerCase());
  if (!ctx) notFound();
  const { services, hours } = await loadSchedule(ctx.business.id);
  const b = ctx.business;
  return (
    <BookingClient
      slug={ctx.card.slug}
      card={{ display_name: ctx.card.display_name, avatar_url: ctx.card.avatar_url }}
      business={{ name: b.name || ctx.card.display_name, address: b.address, notice: b.notice, approval_mode: b.approval_mode, cancel_hours: b.cancel_hours, open: hours.length > 0 }}
      services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes, price: s.price, price_note: s.price_note, image: s.image }))}
    />
  );
}
