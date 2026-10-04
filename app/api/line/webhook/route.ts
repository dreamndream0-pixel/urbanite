import { NextResponse } from 'next/server';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import {
  bindUrl,
  couponsText,
  createBindToken,
  creditText,
  findCustomerByLine,
  getMessagingConfig,
  memberText,
  ordersText,
  replyMessage,
  text,
  verifyLineSignature,
  type LineMessage,
} from '@/lib/line-messaging';

export const dynamic = 'force-dynamic';

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
  postback?: { data?: string };
};

// 未綁定:LINE 一鍵加入會員(LINE 登入即自動綁定),或已用其他方式註冊的會員用綁定連結
function bindMessages(lineUserId: string, channelSecret: string, intro: string): LineMessage[] {
  const url = bindUrl(createBindToken(lineUserId, channelSecret));
  return [
    {
      type: 'template',
      altText: '加入會員 / 綁定帳號',
      template: {
        type: 'buttons',
        text: `${intro}\n\n加入會員後,就能在這裡查詢訂單、優惠券與購物金。`.slice(0, 160),
        actions: [
          { type: 'uri', label: 'LINE 一鍵加入會員', uri: `${getConfiguredSiteUrl()}/auth/line/start?next=/account` },
          { type: 'uri', label: '已有會員帳號?綁定', uri: url },
        ],
      },
    },
  ];
}

const HELP = '輸入以下關鍵字查詢:\n・訂單查詢\n・優惠券\n・購物金\n・會員資料\n・綁定(重新綁定帳號)';

async function handleEvent(event: LineEvent, channelSecret: string, accessToken: string) {
  const lineUserId = event.source?.userId;
  if (!event.replyToken || !lineUserId || event.source?.type !== 'user') return;

  if (event.type === 'follow') {
    const customer = await findCustomerByLine(lineUserId);
    const messages = customer
      ? [text(`歡迎回來,${customer.name || customer.line_display_name || '會員'}!\n\n${HELP}`)]
      : bindMessages(lineUserId, channelSecret, '歡迎加入 Urbanite 官方 LINE!');
    return replyMessage(event.replyToken, messages, accessToken);
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return;
  const input = (event.message.text ?? '').trim();

  if (/^(綁定|綁定會員|會員綁定|重新綁定|加入會員|註冊)$/.test(input)) {
    // 已綁定的會員不再給綁定連結
    const member = await findCustomerByLine(lineUserId);
    if (member) {
      const name = member.name || member.line_display_name || '';
      return replyMessage(
        event.replyToken,
        [text(`${name ? `${name},` : ''}你已經是 Urbanite 官網會員囉!LINE 也已完成綁定 🎉\n\n${HELP}`)],
        accessToken,
      );
    }
    return replyMessage(event.replyToken, bindMessages(lineUserId, channelSecret, '點下方按鈕加入會員或登入,完成 LINE 綁定。'), accessToken);
  }

  const wants = (re: RegExp) => re.test(input);
  const isQuery = wants(/訂單|出貨|物流/) || wants(/優惠|折價|折扣|coupon/i) || wants(/購物金|回饋金|點數/) || wants(/會員|我的資料|帳號/);
  if (!isQuery) return replyMessage(event.replyToken, [text(HELP)], accessToken);

  const customer = await findCustomerByLine(lineUserId);
  if (!customer) {
    return replyMessage(event.replyToken, bindMessages(lineUserId, channelSecret, '查詢會員資料前,需要先綁定會員帳號。'), accessToken);
  }

  let reply: string;
  if (wants(/訂單|出貨|物流/)) reply = await ordersText(customer.user_id);
  else if (wants(/優惠|折價|折扣|coupon/i)) reply = await couponsText(customer.user_id);
  else if (wants(/購物金|回饋金|點數/)) reply = await creditText();
  else reply = await memberText(customer);
  return replyMessage(event.replyToken, [text(reply.slice(0, 4900))], accessToken);
}

// POST /api/line/webhook — LINE 官方帳號 Webhook(需在 LINE Developers 設定此網址)
export async function POST(request: Request) {
  const raw = await request.text();
  const { channelSecret, accessToken } = await getMessagingConfig();
  if (!channelSecret || !accessToken) return NextResponse.json({ error: 'LINE 官方帳號尚未設定' }, { status: 503 });
  if (!verifyLineSignature(raw, request.headers.get('x-line-signature'), channelSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const body = JSON.parse(raw || '{}') as { events?: LineEvent[] };
  // 逐一處理;單一事件失敗不影響其他事件,也一律回 200 避免 LINE 重送
  await Promise.all((body.events ?? []).map((e) => handleEvent(e, channelSecret, accessToken).catch((err) => console.error('LINE event failed', err))));
  return NextResponse.json({ ok: true });
}
