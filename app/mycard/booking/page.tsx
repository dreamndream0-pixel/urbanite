import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { Suspense } from 'react';
import BookingManager from './BookingManager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '線上預約管理 | URBANLINKS' }, robots: { index: false } };

// 名片主人的線上預約管理(服務、營業時段、休假、預約確認)
export default async function MyBookingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/card/login?next=/mycard/booking');
  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <Suspense><BookingManager /></Suspense>
    </main>
  );
}
