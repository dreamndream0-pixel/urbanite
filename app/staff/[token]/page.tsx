import type { Metadata } from 'next';
import { BookingError } from '@/lib/booking/server';
import { portalData } from '@/lib/booking/staff-portal';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import StaffPortal from './StaffPortal';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '我的預約行程 | URBANLINKS' }, robots: { index: false, follow: false }, referrer: 'no-referrer' };

// 服務人員專屬頁(私密連結,不用登入)
export default async function StaffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: Awaited<ReturnType<typeof portalData>> | null = null;
  let msg = '';
  try { data = await portalData(token, getConfiguredSiteUrl()); }
  catch (e) { msg = e instanceof BookingError ? e.message : '讀取失敗,請稍後再試。'; }
  if (!data) return <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec] p-6 text-center text-sm text-[#6b6156]">{msg}</main>;
  return <StaffPortal token={token} initial={data} />;
}
