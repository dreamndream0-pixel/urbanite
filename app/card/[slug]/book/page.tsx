import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicBusiness, loadSchedule, publicCatalog } from '@/lib/booking/server';
import BookingClient from './BookingClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug).toLowerCase());
  const name = ctx ? ctx.business.name || ctx.card.display_name : '線上預約';
  return { title: { absolute: `${name} 線上預約 | URBANLINKS` }, robots: { index: false } };
}

// 名片線上預約頁(對外網址 /@代稱/book)
export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ staff?: string }> }) {
  const { slug } = await params;
  const { staff: staffParam } = await searchParams;
  const ctx = await getPublicBusiness(decodeURIComponent(slug).toLowerCase());
  if (!ctx) notFound();
  const sched = await loadSchedule(ctx.business.id);
  const b = ctx.business;
  const catalog = publicCatalog(sched);
  // 人員專屬預約連結:人員要在職、可接主要服務
  const locked = staffParam ? sched.staff.find((s) => s.id === staffParam && s.active && s.role !== 'assistant') : undefined;
  const open = sched.hours.length > 0 || sched.staffHours.length > 0;
  return (
    <BookingClient
      slug={ctx.card.slug}
      card={{ display_name: ctx.card.display_name, avatar_url: ctx.card.avatar_url }}
      business={{
        line_own: Boolean(b.line_own), line_name: b.line_name ?? '',
        name: b.name || ctx.card.display_name, address: b.address, notice: b.notice, approval_mode: b.approval_mode, cancel_hours: b.cancel_hours,
        allow_any_staff: b.allow_any_staff, payment_info: b.payment_info, service_area: b.service_area, waitlist: b.waitlist_enabled, open,
      }}
      services={catalog.services}
      staff={catalog.staff}
      branches={catalog.branches}
      lockedStaff={locked ? { id: locked.id, name: locked.name } : null}
    />
  );
}
