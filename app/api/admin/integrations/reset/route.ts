import { NextRequest, NextResponse } from 'next/server';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { accountRateLimit, rateLimitResponse } from '@/lib/account-rate-limit';
import { consumePanelResetCode, createPanelResetCode, createUnlockToken, PANEL_UNLOCK_COOKIE, setPanelPassword } from '@/lib/integrations';
import { mailerReady, sendEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/api/admin/integrations' };
const mask = (email: string) => email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');

// 忘記串接設定密碼
// POST { action: 'send' } — 寄 6 位數驗證碼到登入中的管理員信箱
// POST { action: 'confirm', code, next } — 驗證碼正確就設定新密碼並解鎖
export async function POST(request: NextRequest) {
  const admin = await getPlatformAdmin();
  if (!admin?.email) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  if (body?.action === 'send') {
    if (!accountRateLimit(admin.id, 'panel-reset-send', 3)) return rateLimitResponse();
    if (!(await mailerReady())) {
      return NextResponse.json({ error: '還沒設定寄信:請先在 Vercel 環境變數加上 RESEND_API_KEY 與 EMAIL_FROM,重新部署後再試。' }, { status: 400 });
    }
    const code = await createPanelResetCode(admin.email);
    try {
      await sendEmail(admin.email, '串接設定密碼重設驗證碼', `<div style="font-family:sans-serif;font-size:15px;color:#1f1b19">
        <p>你正在重設 URBANITE 後台「串接設定」的密碼。</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
        <p style="color:#8a7f72;font-size:13px">驗證碼 10 分鐘內有效。如果不是你本人操作,請忽略這封信。</p></div>`);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '寄信失敗' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, to: mask(admin.email) });
  }

  if (body?.action === 'confirm') {
    if (!accountRateLimit(admin.id, 'panel-reset-confirm', 8)) return rateLimitResponse();
    const code = String(body?.code ?? '');
    const next = String(body?.next ?? '');
    if (next.length < 12 || next.length > 256) return NextResponse.json({ error: '新密碼需為 12 至 256 碼' }, { status: 400 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (!(await consumePanelResetCode(admin.email, code))) {
      return NextResponse.json({ error: '驗證碼錯誤或已過期,請重新寄送' }, { status: 403 });
    }
    await setPanelPassword(next);
    const { token, maxAge } = createUnlockToken(admin.email);
    const response = NextResponse.json({ unlocked: true });
    response.cookies.set(PANEL_UNLOCK_COOKIE, token, { ...cookieOptions, maxAge });
    return response;
  }

  return NextResponse.json({ error: '無效的操作' }, { status: 400 });
}
