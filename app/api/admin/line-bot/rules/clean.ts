import type { MessageSet } from '@/lib/line-bot-types';

// 規則欄位整理(只保留已知欄位)
export function cleanRule(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') out.name = body.name.trim().slice(0, 60);
  if (Array.isArray(body.keywords)) {
    out.keywords = [...new Set((body.keywords as unknown[]).map((k) => String(k).trim()).filter(Boolean))].slice(0, 30);
  }
  if (body.match === 'exact' || body.match === 'contains') out.match = body.match;
  if (body.content && typeof body.content === 'object') {
    const c = body.content as Partial<MessageSet>;
    out.content = { messages: Array.isArray(c.messages) ? c.messages.slice(0, 5) : [], quickReplies: Array.isArray(c.quickReplies) ? c.quickReplies.slice(0, 13) : [] };
  }
  if (typeof body.enabled === 'boolean') out.enabled = body.enabled;
  if ('schedule' in body) {
    const s = body.schedule as { days?: unknown; start?: unknown; end?: unknown } | null;
    out.schedule =
      s && typeof s.start === 'string' && typeof s.end === 'string'
        ? { days: Array.isArray(s.days) ? s.days.filter((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) : [], start: s.start, end: s.end }
        : null;
  }
  return out;
}
