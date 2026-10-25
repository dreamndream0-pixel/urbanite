import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VIDEO_POINT_PACKAGES, videoStudioUrl } from '@/lib/video-points';
import PointsClient from './PointsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '影片點數 | Seedance Studio' }, robots: { index: false } };

// Seedance Studio 影片點數:目前餘額、購買點數、最近的點數紀錄
export default async function VideoPointsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/video/points')}`);
  const db = createAdminClient();
  const [{ data: account }, { data: ledger }] = await Promise.all([
    db.from('video_point_accounts').select('balance').eq('user_id', user.id).maybeSingle(),
    db.from('video_point_ledger').select('delta, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
  ]);
  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <PointsClient
        balance={account?.balance ?? 0}
        ledger={ledger ?? []}
        packages={VIDEO_POINT_PACKAGES.map((p) => ({ ...p }))}
        result={result ?? ''}
        studioUrl="/api/video-points/connect"
        studioHome={videoStudioUrl()}
      />
    </main>
  );
}
