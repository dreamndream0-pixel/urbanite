// 寄信(Resend)。金鑰與寄件信箱讀「串接設定」,沒填就讀主機環境變數。只能在伺服器端使用。
import { getIntegrations } from '@/lib/integrations';

export async function mailerReady() {
  const cfg = await getIntegrations(['RESEND_API_KEY', 'EMAIL_FROM'] as const);
  return Boolean(cfg.RESEND_API_KEY && cfg.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, html: string, fromName = 'URBANITE') {
  const cfg = await getIntegrations(['RESEND_API_KEY', 'EMAIL_FROM'] as const);
  if (!cfg.RESEND_API_KEY || !cfg.EMAIL_FROM) throw new Error('尚未設定寄信(RESEND_API_KEY / EMAIL_FROM)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName.replace(/[<>"]/g, '')} <${cfg.EMAIL_FROM}>`, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`寄信失敗(${res.status})`);
}
