import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { fetchBotProfile, getMessagingConfig, verifyBindToken } from '@/lib/line-messaging';
import BindClient from './BindClient';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '綁定 LINE', robots: { index: false } };

// LINE 官方帳號傳來的綁定連結:登入(任何方式)後確認綁定
export default async function LineBindPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams;
  const { channelSecret, accessToken } = await getMessagingConfig();

  let lineUserId = '';
  let error = '';
  try {
    lineUserId = verifyBindToken(t, channelSecret).lineUserId;
  } catch (e) {
    error = e instanceof Error ? e.message : '綁定連結無效';
  }

  const user = error ? null : await getSessionUser();
  if (!error && !user) redirect(`/login?next=${encodeURIComponent(`/line/bind?t=${t}`)}`);

  let profile: { displayName?: string; pictureUrl?: string } | null = null;
  let alreadyMine = false;
  let boundElsewhere = false;
  if (user && lineUserId) {
    const supabase = scopedClient(URBANITE_SHOP_ID);
    const { data } = await supabase.from('customers').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
    alreadyMine = data?.user_id === user.id;
    boundElsewhere = Boolean(data?.user_id && data.user_id !== user.id);
    profile = accessToken ? await fetchBotProfile(lineUserId, accessToken) : null;
  }

  const account = user?.email?.endsWith('@line.urbanite.com.tw') ? '(LINE 登入的帳號)' : user?.email ?? '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--c-bg)] px-5 py-12 text-[var(--c-text)]">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#06C755] text-white">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3.5C6.8 3.5 2.6 6.9 2.6 11.1c0 3.8 3.4 6.9 7.9 7.5.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.5s5.9-3.5 8-5.9c1.5-1.6 2.2-3.2 2.2-4.9 0-4.2-4.2-7.5-9.3-7.5z" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-semibold">綁定 LINE 會員</h1>
        {error ? (
          <p className="mt-3 text-sm leading-6 text-[#c0392b]">{error}</p>
        ) : (
          <BindClient
            token={t}
            lineName={profile?.displayName ?? ''}
            linePicture={profile?.pictureUrl ?? ''}
            account={account}
            alreadyMine={alreadyMine}
            boundElsewhere={boundElsewhere}
          />
        )}
      </div>
    </main>
  );
}
