import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { CARD_TEMPLATES, type ProfileCard, type ProfileCardBlock } from '@/lib/profile-card';
import { CONTACT_LINE_URL, TIERS } from '@/lib/card-plan';
import CardServiceHeader from './CardServiceHeader';
import DemoPhone from './DemoPhone';
import TierTable from './TierTable';
import ContactLineButton from './ContactLineButton';
import RefCapture from './RefCapture';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: 'URBANLINKS|一個網址,放進你的全部' },
  description: 'IG、LINE、作品、商品連結整理在同一頁。用 Google 或 LINE 免費建立你的個人名片。',
};

// 範例頭像與封面(內建 SVG,不用外部圖片)
const svg = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const avatar = (bg: string, fg: string, letter: string) =>
  svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><circle cx="100" cy="82" r="38" fill="${fg}" opacity=".9"/><path d="M34 196c8-44 36-66 66-66s58 22 66 66" fill="${fg}" opacity=".9"/><text x="100" y="94" font-family="Georgia,serif" font-size="34" text-anchor="middle" fill="${bg}">${letter}</text></svg>`);
const cover = (a: string, b: string) =>
  svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><circle cx="820" cy="300" r="260" fill="#fff" opacity=".12"/><circle cx="200" cy="1100" r="340" fill="#000" opacity=".06"/></svg>`);

const block = (id: string, title: string, extra: Partial<ProfileCardBlock> = {}): ProfileCardBlock => ({
  id, card_id: 'demo', type: 'link', title, url: '#', image: '', product_id: '', enabled: true, sort_order: 0, clicks: 0, start_at: null, end_at: null, ...extra,
});

const DEMOS: { card: ProfileCard; blocks: ProfileCardBlock[] }[] = [
  {
    card: demoCard('hero-sun', 'Mia 陳', '插畫|品牌視覺|接案中', avatar('#e9c9a8', '#8a5a35', 'M'), cover('#e0b48a', '#7a4e2e'), ['插畫', '接案']),
    blocks: [block('a1', '作品集', { image: 'icon:palette' }), block('a2', '合作邀約', { image: 'icon:mail' }), block('a3', 'IG 每日速寫', { image: 'icon:instagram' })],
  },
  {
    card: demoCard('polaroid-green', '小綠手作', '週末市集|植物盆器', avatar('#cfdcc5', '#3f7a33', 'G'), '', ['手作', '植物']),
    blocks: [block('b1', '本週市集時間'), block('b2', 'LINE 預約訂購'), block('b3', '蝦皮賣場')],
  },
  {
    card: demoCard('side-noir', 'Leo Studio', '攝影師|婚紗・商業', avatar('#3a3a3a', '#d8d8d8', 'L'), '', ['攝影']),
    blocks: [block('c1', '2026 檔期'), block('c2', '價目表'), block('c3', '聯絡我')],
  },
];

function demoCard(template: string, name: string, bio: string, avatarUrl: string, coverUrl: string, tags: string[]): ProfileCard {
  const t = CARD_TEMPLATES.find((x) => x.key === template)!;
  return {
    id: template, slug: template, display_name: name, avatar_url: avatarUrl, email: '', show_email: false, bio, show_bio: true,
    socials: [{ type: 'instagram', value: 'demo' }, { type: 'line', value: '@demo' }], show_socials: true, tags, show_tags: true,
    theme: { ...t.theme, template, coverImage: coverUrl }, published: true, seo_title: '', seo_description: '', seo_image: '', show_footer_logo: false,
  };
}

const STEPS = [
  { n: '01', title: '用 Google 或 LINE 登入', body: '不用另外記帳號密碼,登入就會幫你建好一張名片。' },
  { n: '02', title: '選樣板,放上連結', body: '把 IG、LINE、作品集、賣場整理好,順序拖曳就能調整。' },
  { n: '03', title: '把網址貼到個人簡介', body: '網址是 urbanite.com.tw/@你的代稱,也可以下載 QR Code 印在名片上。' },
];

const FEATURES = [
  { title: '24 款樣板', body: '拍立得、雜誌、報紙、滿版封面⋯⋯排版不一樣,不只是換顏色。' },
  { title: '圖文連結', body: '一張大圖、兩欄、輪播都可以,貼上網址自動帶出標題和圖片。' },
  { title: '100 個常用圖示', body: '連結按鈕可以放自己的圖,或從內建圖示挑一個。' },
  { title: '流量來源', body: '看得到訪客從 Instagram、LINE、Facebook 哪裡點進來。' },
  { title: '限時顯示', body: '活動連結設定開始和結束時間,時間到自動上下架。' },
  { title: 'QR Code 與分享連結', body: '每個平台一條專屬分享連結,數據分得更清楚。' },
];

const FAQ = [
  { q: '真的免費嗎?', a: 'U Free 可以一直用,不會到期。需要更多樣板、自訂樣式或完整數據時,再升級 U Plus。' },
  { q: 'U Pro 和 U Max 怎麼申請?', a: '點方案卡上的「聯繫專員」加入官方 LINE,專員會依你的需求協助開通。U Pro 包含子網域官網、商品上架與結帳;U Max 開放全部功能,包含會員、物流、LINE 機器人與自訂網域。' },
  { q: '付費方案會自動續約扣款嗎?', a: '不會。付費方案都是預付制,月付或年付一次,到期前會在後台提醒,到期後自動回到 U Free,名片和資料都會保留。' },
  { q: '網址代稱可以改嗎?', a: '可以,在「個人簡介」隨時修改。改了之後舊網址就會失效,記得更新你貼出去的地方。' },
  { q: '可以用哪些方式付款?', a: '信用卡、ATM 轉帳、超商代碼等,依付款頁顯示的方式為準。' },
];

export default async function CardServicePage() {
  const user = await getSessionUser();
  const { data: settings } = await createAdminClient().from('site_settings').select('logo_url').eq('id', 1).maybeSingle();
  const logoUrl = settings?.logo_url ?? '';
  const start = user ? '/mycard' : '/card/login';

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader logoUrl={logoUrl} loggedIn={Boolean(user)} />
      <RefCapture />

      {/* 主視覺 */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
        <div>
          <p className="text-xs font-semibold tracking-[0.3em] text-[#8a7f72]">URBANLINKS 個人名片</p>
          <h1 className="font-serif-tc mt-4 text-[40px] font-bold leading-[1.2] tracking-[0.04em] sm:text-[52px]">
            一個網址,
            <br />
            放進你的全部。
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-8 text-[#5f5852]">IG、LINE、作品集、賣場、預約表單,整理在同一頁。用 Google 或 LINE 登入,三分鐘就能完成。</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={start} className="rounded-full bg-[#1f1b19] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#3a322e]">{user ? '編輯我的名片' : '免費建立名片'}</Link>
            <Link href="#pricing" className="rounded-full border border-[#d7c9bd] px-6 py-3.5 text-sm text-[#1f1b19] transition hover:bg-white">看方案</Link>
          </div>
          <p className="mt-4 text-xs text-[#a99e8f]">免費版不用綁信用卡</p>
        </div>
        <div className="relative flex justify-center gap-3 sm:gap-4">
          {DEMOS.map((d, i) => (
            <div key={d.card.id} className={`w-[31%] max-w-[210px] overflow-hidden rounded-[22px] border-[5px] border-[#1f1b19] bg-white shadow-[0_18px_40px_rgba(31,27,25,0.16)] ${i === 1 ? '-translate-y-6' : 'translate-y-4'}`}>
              <DemoPhone card={d.card} blocks={d.blocks} />
            </div>
          ))}
        </div>
      </section>

      {/* 怎麼開始 */}
      <section className="border-y border-[#e5ded4] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3 sm:px-6">
          {STEPS.map((s) => (
            <div key={s.n}>
              <p className="font-serif-tc text-sm font-bold text-[#702838]">{s.n}</p>
              <p className="mt-2 text-lg font-semibold">{s.title}</p>
              <p className="mt-2 text-sm leading-7 text-[#6b6156]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 功能 */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-serif-tc text-2xl font-bold tracking-[0.06em] sm:text-3xl">做名片需要的,都在這裡</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[#e5ded4] bg-[#e5ded4] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[#faf7f2] p-6">
              <p className="font-semibold">{f.title}</p>
              <p className="mt-2 text-sm leading-7 text-[#6b6156]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 方案 */}
      <section id="pricing" className="scroll-mt-20 border-t border-[#e5ded4] bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="font-serif-tc text-center text-2xl font-bold tracking-[0.06em] sm:text-3xl">四個等級,從名片到官網</h2>
          <p className="mt-2 text-center text-sm text-[#8a7f72]">先免費用,需要時再升級。付費方案都是預付制,不會自動扣款。</p>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TIERS.map((t) => {
              const highlight = t.key === 'plus';
              const href = t.key === 'free' ? start : user ? '/mycard/upgrade' : '/card/login?next=/mycard/upgrade';
              return (
                <div key={t.key} className={`flex flex-col rounded-2xl p-5 ${highlight ? 'border-2 border-[#1f1b19]' : 'border border-[#e5ded4]'}`}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {t.name}
                    {highlight ? <span className="rounded-full bg-[#1f1b19] px-1.5 py-0.5 text-[10px] text-white">推薦</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-[#8a7f72]">{t.tagline}</p>
                  <p className="mt-3 text-2xl font-bold">
                    {t.prices ? <>NT${t.prices.month}<span className="text-xs font-normal text-[#8a7f72]"> / 月</span></> : 'NT$0'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#a99e8f]">{t.prices ? `年付 NT$${t.prices.year.toLocaleString()}` : '一直免費'}</p>
                  <div className="mt-auto pt-4">
                    {t.available ? (
                      <Link href={href} className={`block rounded-full py-2 text-center text-xs font-semibold ${highlight ? 'bg-[#1f1b19] text-white' : 'border border-[#1f1b19]'}`}>
                        {t.key === 'free' ? '開始使用' : `升級 ${t.name}`}
                      </Link>
                    ) : (
                      <ContactLineButton href={CONTACT_LINE_URL} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6">
            <TierTable />
          </div>
        </div>
      </section>

      {/* 常見問題 */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="font-serif-tc text-2xl font-bold tracking-[0.06em]">常見問題</h2>
        <div className="mt-6 divide-y divide-[#e5ded4] border-y border-[#e5ded4]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium">
                {f.q}
                <span className="text-[#a99e8f] transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-7 text-[#6b6156]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-[#1f1b19] text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-14 text-center sm:px-6">
          <p className="font-serif-tc text-2xl font-bold tracking-[0.06em]">現在就做一張</p>
          <Link href={start} className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-[#1f1b19]">{user ? '編輯我的名片' : '用 Google 或 LINE 免費建立'}</Link>
        </div>
      </section>
    </main>
  );
}
