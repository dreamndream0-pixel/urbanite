import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getPosUser } from '@/lib/pos-auth';
import PosApp from './PosApp';
import PosSignOut from './PosSignOut';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'POS 門市結帳' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// POS 門市結帳:這家店的管理員,或後台登記的 POS 員工可以用;銷售寫進同一份訂單與庫存
export default async function PosPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login?next=/pos');
  if (!(await getPosUser())) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f6f2ec] p-6 text-center text-[#5f5852]">
        <div className="max-w-sm">
          <p className="text-lg font-semibold text-[#1f1b19]">這個帳號還不能使用 POS</p>
          <p className="mt-2 text-sm">目前登入:<b className="break-all">{sessionUser.email || '(沒有 Email)'}</b></p>
          <p className="mt-2 text-sm">請店長到後台「POS・分店調貨」→「POS 員工」,用上面這個 Email 把你加入。自己填 Email 註冊的帳號要先完成信箱驗證。</p>
          <PosSignOut />
        </div>
      </main>
    );
  }
  return <PosApp />;
}
