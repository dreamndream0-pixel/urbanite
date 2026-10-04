import { AUDIENCE_OPTIONS, type MessageSet } from '@/lib/line-bot-types';

// 推播欄位整理(已送出的不能改)
export function cleanBroadcast(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') out.title = body.title.trim().slice(0, 80);
  if (body.content && typeof body.content === 'object') {
    const c = body.content as Partial<MessageSet>;
    out.content = { messages: Array.isArray(c.messages) ? c.messages.slice(0, 5) : [], quickReplies: Array.isArray(c.quickReplies) ? c.quickReplies.slice(0, 13) : [] };
  }
  if (typeof body.audience === 'string' && AUDIENCE_OPTIONS.some((a) => a.key === body.audience)) out.audience = body.audience;
  if ('scheduled_at' in body) {
    const d = body.scheduled_at ? new Date(String(body.scheduled_at)) : null;
    out.scheduled_at = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  if (body.status === 'draft' || body.status === 'scheduled') out.status = body.status;
  return out;
}
