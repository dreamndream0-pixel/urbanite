import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  couponsText,
  creditText,
  fetchBotProfile,
  findCustomerByLine,
  getMessagingConfig,
  memberText,
  ordersText,
  replyMessage,
  verifyLineSignature,
  type LineMessage,
} from '@/lib/line-messaging';
import { fillVars, keywordMatches, loadBotConfig, loadRules, logEvent, ruleActiveNow, toLineMessages } from '@/lib/line-bot';
import type { BuiltinKey, MessageSet } from '@/lib/line-bot-types';

export const dynamic = 'force-dynamic';

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
};

const QUERY_ORDER: BuiltinKey[] = ['bind', 'orders', 'coupons', 'credit', 'member'];

async function handleEvent(event: LineEvent, accessToken: string) {
  const lineUserId = event.source?.userId;
  if (!lineUserId || event.source?.type !== 'user') return;

  if (event.type === 'unfollow') return logEvent('unfollow', lineUserId);
  if (!event.replyToken) return;

  const { config } = await loadBotConfig();
  const customer = await findCustomerByLine(lineUserId);
  const profile = await fetchBotProfile(lineUserId, accessToken).catch(() => null);
  const lineName = profile?.displayName || '你';
  const vars = { LINE名稱: lineName, 會員姓名: customer?.name || customer?.line_display_name || lineName };
  const reply = async (set: MessageSet, trackKey: string) => {
    const messages = await toLineMessages(set, { vars, lineUserId, trackKey }, config.brandColor);
    if (messages.length) await replyMessage(event.replyToken!, messages, accessToken);
  };
  const replyText = (text: string, quick: string[] = []) => reply({ messages: [{ id: 't', type: 'text', text }], quickReplies: quick }, 'text');
  const memberQuick = config.welcomeMember.quickReplies;

  // 加好友:依是否已是會員傳送不同的歡迎訊息
  if (event.type === 'follow') {
    await logEvent('follow', lineUserId, customer ? 'member' : 'guest');
    return reply(customer ? config.welcomeMember : config.welcomeGuest, customer ? 'welcome:member' : 'welcome:guest');
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return;
  const input = (event.message.text ?? '').trim();
  await logEvent('message', lineUserId);

  const rules = (await loadRules(true)).filter(ruleActiveNow);
  const ruleHit = async (match: 'exact' | 'contains') => {
    const rule = rules.find((r) => r.match === match && keywordMatches(r.keywords, input, match));
    if (!rule) return false;
    await logEvent('rule', lineUserId, rule.id);
    await createAdminClient().from('line_bot_rules').update({ hits: (rule.hits ?? 0) + 1 }).eq('id', rule.id);
    await reply(rule.content, `rule:${rule.id}`);
    return true;
  };

  // 1. 完全符合的關鍵字規則優先
  if (await ruleHit('exact')) return;

  // 2. 內建查詢(綁定、訂單、優惠券、購物金、會員資料)
  for (const key of QUERY_ORDER) {
    const b = config.builtins[key];
    if (!b.enabled || !keywordMatches(b.keywords, input, key === 'bind' ? 'exact' : 'contains')) continue;
    await logEvent('builtin', lineUserId, key);
    if (key === 'bind') {
      if (customer) return replyText(fillVars(config.alreadyMember, vars), memberQuick);
      return reply({ messages: [{ id: 'b0', type: 'text', text: b.intro }, { id: 'b1', type: 'bind' }], quickReplies: [] }, 'bind');
    }
    if (!customer) {
      return reply(
        { messages: [{ id: 'g0', type: 'text', text: '查詢會員資料前,要先綁定官網會員。' }, { id: 'g1', type: 'bind' }], quickReplies: [] },
        'bind',
      );
    }
    const text =
      key === 'orders' ? await ordersText(customer.user_id, b.intro)
      : key === 'coupons' ? await couponsText(customer.user_id, b.intro)
      : key === 'credit' ? await creditText(b.intro)
      : await memberText(customer, b.intro);
    return replyText(text.slice(0, 4900), memberQuick);
  }

  // 3. 包含關鍵字的規則
  if (await ruleHit('contains')) return;

  // 4. 沒對到:預設回覆(關閉時不回覆,留給真人客服)
  if (config.defaultReply.enabled) {
    await logEvent('default', lineUserId);
    return reply(config.defaultReply, 'default');
  }
}

// POST /api/line/webhook — LINE 官方帳號 Webhook
export async function POST(request: Request) {
  const raw = await request.text();
  const { channelSecret, accessToken } = await getMessagingConfig();
  if (!channelSecret || !accessToken) return NextResponse.json({ error: 'LINE 官方帳號尚未設定' }, { status: 503 });
  if (!verifyLineSignature(raw, request.headers.get('x-line-signature'), channelSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const body = JSON.parse(raw || '{}') as { events?: LineEvent[] };
  await Promise.all(
    (body.events ?? []).map((e) =>
      handleEvent(e, accessToken).catch(async (err) => {
        console.error('LINE event failed', err);
        // 回覆失敗時至少給一句話
        if (e.replyToken) await replyMessage(e.replyToken, [{ type: 'text', text: '系統忙碌中,請稍後再試一次。' } as LineMessage], accessToken).catch(() => {});
      }),
    ),
  );
  return NextResponse.json({ ok: true });
}
