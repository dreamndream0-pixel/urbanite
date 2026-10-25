import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { VIDEO_TRIAL_POINTS, videoConnectToken, videoPointsReady, videoStudioConfigured, videoStudioUrl } from '@/lib/video-points';

export const dynamic = 'force-dynamic';

// GET /api/video-points/connect — 影片網站的「用 Urbanite 會員登入」:
// 未登入先到本站登入;登入後發一次性簽章連結導回影片網站。首次連結且已驗證的會員送一次試用點數。
export async function GET() {
  const site = getConfiguredSiteUrl();
  if (!videoStudioConfigured()) return NextResponse.redirect(`${site}/video/points?result=unavailable`);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${site}/login?next=${encodeURIComponent('/api/video-points/connect')}`);
  // 試用點數只給已驗證的會員:Email 已確認,或透過 LINE / Google 等第三方登入。
  const verified = Boolean(user.email_confirmed_at) || (user.app_metadata?.provider ?? 'email') !== 'email';
  if (verified && (await videoPointsReady())) {
    await createAdminClient().rpc('video_points_grant_trial_v1', { p_user: user.id, p_points: VIDEO_TRIAL_POINTS }).then(() => {}, () => {});
  }
  return NextResponse.redirect(`${videoStudioUrl()}/auth/urbanite?token=${encodeURIComponent(videoConnectToken(user))}`);
}
