import type { Metadata } from 'next';
import Link from 'next/link';
import { Caveat } from 'next/font/google';
import QRCode from 'qrcode';
import { getSessionUser } from '@/lib/supabase/server';
import { CARD_TEMPLATES, type ProfileCard, type ProfileCardBlock } from '@/lib/profile-card';
import { CONTACT_LINE_URL, SERVICE_LOGO, TIERS, type CardTier } from '@/lib/card-plan';
import DemoPhone from './DemoPhone';
import ShowcaseCarousel, { type ShowcaseItem } from './ShowcaseCarousel';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCheckoutLine, lineAddFriendUrl } from '@/lib/checkout-line';
import type { CardProduct } from '@/app/components/ProfileCardView';
import type { SiteSettings } from '@/lib/types';
import TierTable from './TierTable';
import RefCapture from './RefCapture';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: 'URBANLINKS|一個網址,放進你的全部' },
  description: 'IG、LINE、作品、商品連結整理在同一頁。用 Google 或 LINE 免費建立你的個人名片。',
};

// 手寫風英文點綴
const script = Caveat({ subsets: ['latin'], weight: ['500', '600'] });
const LIME = '#d4f53c';

// 範例頭像與封面(內建 SVG,不用外部圖片)
const svg = (s: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
const avatar = (bg: string, fg: string, letter: string) =>
  svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><circle cx="100" cy="82" r="38" fill="${fg}" opacity=".9"/><path d="M34 196c8-44 36-66 66-66s58 22 66 66" fill="${fg}" opacity=".9"/><text x="100" y="94" font-family="Georgia,serif" font-size="34" text-anchor="middle" fill="${bg}">${letter}</text></svg>`);
const cover = (a: string, b: string) =>
  svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><circle cx="820" cy="300" r="260" fill="#fff" opacity=".12"/><circle cx="200" cy="1100" r="340" fill="#000" opacity=".06"/></svg>`);

const block = (id: string, title: string, extra: Partial<ProfileCardBlock> = {}): ProfileCardBlock => ({
  id, card_id: 'demo', type: 'link', title, url: '#', image: '', product_id: '', enabled: true, sort_order: 0, clicks: 0, start_at: null, end_at: null, ...extra,
});

function demoCard(template: string, name: string, bio: string, avatarUrl: string, coverUrl: string, tags: string[]): ProfileCard {
  const t = CARD_TEMPLATES.find((x) => x.key === template) ?? CARD_TEMPLATES[0];
  return {
    id: template, slug: template, display_name: name, avatar_url: avatarUrl, email: '', show_email: false, bio, show_bio: true,
    socials: [{ type: 'instagram', value: 'demo' }, { type: 'line', value: '@demo' }, { type: 'youtube', value: 'demo' }], show_socials: true, tags, show_tags: true,
    theme: { ...t.theme, template, coverImage: coverUrl }, published: true, seo_title: '', seo_description: '', seo_image: '', show_footer_logo: false,
  };
}

// 作品案例:實際的 @urbanite 名片,套上不同樣板
const SHOWCASE_TEMPLATES = ['label-sand', 'polaroid-green', 'hero-sun', 'side-noir', 'mag-mono', 'arch-aurora', 'news', 'float-dark', 'framed-wood'];

async function loadShowcase() {
  const supabase = createAdminClient();
  const { data: card } = await supabase.from('profile_cards').select('*').eq('slug', 'urbanite').maybeSingle();
  if (!card) return null;
  const [{ data: blocks }, { data: settings }] = await Promise.all([
    supabase.from('profile_card_blocks').select('*').eq('card_id', card.id).order('sort_order'),
    supabase.from('site_settings').select('footer_sections').eq('id', 1).maybeSingle(),
  ]);
  const ids = [...new Set((blocks ?? []).filter((x) => x.type === 'product' && x.product_id).map((x) => x.product_id as string))];
  const { data: rows } = ids.length ? await supabase.from('products').select('id,name,price,original_price,image,images,status').in('id', ids) : { data: [] };
  const products: Record<string, CardProduct> = {};
  for (const p of rows ?? []) {
    if (p.status !== '已下架') products[p.id] = { id: p.id, name: p.name, price: p.price, original_price: p.original_price, image: p.image || p.images?.[0] || '' };
  }
  const base = card as ProfileCard;
  const theme = (base.theme ?? {}) as Partial<ProfileCard['theme']>;
  const items: ShowcaseItem[] = SHOWCASE_TEMPLATES.flatMap((key) => {
    const t = CARD_TEMPLATES.find((x) => x.key === key);
    if (!t) return [];
    return [{ key, label: t.name, card: { ...base, theme: { ...t.theme, template: key, coverImage: theme.coverImage ?? '', showAvatar: theme.showAvatar ?? true } } }];
  });
  return {
    items,
    blocks: (blocks ?? []) as ProfileCardBlock[],
    products,
    lineUrl: lineAddFriendUrl(getCheckoutLine(settings as Pick<SiteSettings, 'footer_sections'> | null)),
  };
}

const STEPS = [
  { n: '01', title: '登入', body: '使用 Google 或 LINE,不用再記一組新的帳號密碼。' },
  { n: '02', title: '放上你的連結', body: 'IG、LINE、作品集、賣場、預約表單,想放什麼就放什麼。' },
  { n: '03', title: '分享出去', body: '把網址放進 IG 自介、LINE、名片或 QR Code,分享這一個網址就夠了。' },
];

const PLAN_COPY: Record<CardTier, { who: string; desc: string; items: string[] }> = {
  free: { who: '適合想先試試看的你', desc: '建立專屬個人名片,整理基本連結。', items: ['8 款基本樣板', '最多 8 個連結與區塊', 'urbanite.com.tw/@專屬網址', '近 7 天流量數據'] },
  plus: { who: '適合創作者、個人品牌', desc: '更多自訂功能,打造完整的個人頁面。', items: ['24 款樣板全部開放', '自訂背景、字色、按鈕', '限時顯示', '流量來源與 30 天數據', '自訂分享預覽、隱藏標誌'] },
  pro: { who: '適合接案工作者、小型商家', desc: '從名片延伸成可以接單的官網。', items: ['U Plus 全部功能', '子網域官網', '商品上架與結帳', '串接自己的金流'] },
  max: { who: '適合品牌、商店、企業', desc: '從名片到完整官網,所有功能都打開。', items: ['U Pro 全部功能', '會員與購物金', '物流串接', 'LINE 機器人、自訂網域'] },
};

const FAQ = [
  { q: 'URBANLINKS 是什麼?', a: '一個放進你所有連結的個人頁面。IG、LINE、作品集、賣場、預約表單都整理在同一頁,只要分享一個網址,別人就能找到你的全部。' },
  { q: '需要付費嗎?免費方案有什麼限制?', a: 'U Free 可以一直免費使用,不會到期。免費版有 8 款樣板、最多 8 個區塊和近 7 天數據;需要更多樣板、自訂樣式或完整數據時再升級 U Plus。付費都是預付制,不會自動扣款。' },
  { q: '可以用自己的網域嗎?', a: '自訂網域是 U Max 的功能。U Pro 提供子網域官網;U Free 與 U Plus 使用 urbanite.com.tw/@你的代稱。' },
  { q: '我可以販售商品嗎?', a: 'U Pro 以上可以上架商品並接受線上付款,金流各自串接自己的藍新帳號。U Pro、U Max 由專員協助開通,點方案卡上的「聯繫專員」就能找到我們。' },
  { q: '如何查看流量數據?', a: '登入後在「數據分析」可以看到瀏覽、點擊與每個連結的點擊數;U Plus 以上還看得到訪客從 Instagram、LINE、Facebook 哪裡點進來。' },
  { q: '如果以後不想用了,可以刪除嗎?', a: '可以隨時在「名片設定」把名片設為不公開;如果要刪除帳號與資料,聯繫專員就會幫你處理。' },
];

function Check({ light }: { light?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={light ? LIME : '#1f1b19'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function FeatureCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#ece9e3] bg-white p-5">
      <p className="text-[15px] font-bold">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-[#77716b]">{body}</p>
      <div className="mt-4 flex flex-1 items-end">{children}</div>
    </div>
  );
}

export default async function CardServicePage() {
  const user = await getSessionUser();
  const start = user ? '/mycard' : '/card/login';
  const upgradeHref = user ? '/mycard/upgrade' : '/card/login?next=/mycard/upgrade';
  const showcase = await loadShowcase();
  const qr = await QRCode.toString('https://www.urbanite.com.tw/@yourname', { type: 'svg', margin: 0, color: { dark: '#1f1b19', light: '#0000' } });

  return (
    <main className="min-h-screen bg-[#fafaf8] text-[#1f1b19]">
      <RefCapture />

      {/* 導覽列 */}
      <header className="sticky top-0 z-30 border-b border-[#ece9e3] bg-[#fafaf8]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Link href="/card" className="shrink-0">
            <img src={SERVICE_LOGO} alt="URBANLINKS" className="h-[17px] w-auto object-contain" />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-[#4a4540] md:flex">
            <a href="#features" className="hover:text-[#1f1b19]">功能介紹</a>
            <a href="#pricing" className="hover:text-[#1f1b19]">方案價格</a>
            <a href="#cases" className="hover:text-[#1f1b19]">作品案例</a>
            <a href="#faq" className="hover:text-[#1f1b19]">常見問題</a>
          </nav>
          <div className="ml-auto flex items-center gap-4 text-[13px]">
            {user ? (
              <Link href="/mycard" className="flex items-center gap-1.5 rounded-md bg-[#1f1b19] px-4 py-2 font-medium text-white">我的名片 <Arrow /></Link>
            ) : (
              <>
                <Link href="/card/login" className="text-[#4a4540] hover:text-[#1f1b19]">登入</Link>
                <Link href="/card/register" className="flex items-center gap-1.5 rounded-md bg-[#1f1b19] px-4 py-2 font-medium text-white">免費註冊 <Arrow /></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 主視覺 */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pb-24 lg:pt-16">
          <div>
            <p className={`${script.className} -rotate-3 text-2xl text-[#a8a29b]`}>More than a link</p>
            <h1 className="mt-3 text-[40px] font-black leading-[1.18] tracking-[0.02em] sm:text-[54px]">
              一個網址,
              <br />
              放進你的全部。
            </h1>
            <p className="mt-6 text-[15px] leading-8 text-[#55504a]">
              你的作品、社群、商店和正在做的事,
              <br />
              都在這裡。一個網址,讓別人更快認識你。
            </p>
            <Link href={start} className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#1f1b19] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#3a3632]">
              {user ? '編輯我的名片' : '免費建立我的頁面'} <Arrow />
            </Link>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#8a847d]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#ece9e3]">
                <svg width="13" height="13" viewBox="0 0 32 32" aria-hidden="true"><path fill="#4285F4" d="M29 16.3c0-.9-.1-1.6-.2-2.4H16v4.5h7.3c-.1 1.1-.9 2.8-2.5 3.9v2.9h4c2.4-2.2 4.2-5.4 4.2-8.9Z" /><path fill="#34A853" d="M16 29c3.5 0 6.4-1.1 8.5-3.1l-4-2.9c-1.1.7-2.5 1.2-4.5 1.2-3.4 0-6.3-2.3-7.3-5.4H4.6v3C6.7 26 11 29 16 29Z" /><path fill="#FBBC05" d="M8.7 18.8c-.3-.8-.4-1.7-.4-2.8s.1-2 .4-2.8v-3H4.6A13 13 0 0 0 3 16c0 2.1.5 4.1 1.6 5.8l4.1-3Z" /><path fill="#EA4335" d="M16 7.8c2 0 3.4.9 4.2 1.6l3.1-3C21.4 4.6 18.5 3 16 3 11 3 6.7 6 4.6 10.2l4.1 3C9.7 10.1 12.6 7.8 16 7.8Z" /></svg>
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#06C755]">
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M21.5 10.6c0-4.3-4.3-7.8-9.5-7.8S2.5 6.3 2.5 10.6c0 3.8 3.4 7 8 7.7.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .8.5 1-.4 5.2-3.1 7.1-5.3 1.3-1.4 2.4-3.1 2.4-5.1Z" /></svg>
              </span>
              使用 Google 或 LINE 快速註冊,免費版不用綁信用卡
            </div>
          </div>

          <div id="cases" className="min-w-0 scroll-mt-20">
            {showcase ? <ShowcaseCarousel items={showcase.items} blocks={showcase.blocks} products={showcase.products} lineUrl={showcase.lineUrl} /> : null}
            <p className="-mt-1 -rotate-2 text-xs tracking-[0.1em] text-[#8a847d]">同一張名片,換個樣板就是不同風格。三分鐘,完成專屬頁面!</p>
          </div>
        </div>
      </section>

      {/* 三個步驟 */}
      <section className="border-y border-[#ece9e3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_2fr] lg:items-center">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.25em] text-[#a8a29b]">HOW IT WORKS</p>
            <h2 className="mt-2 text-2xl font-black leading-snug sm:text-[28px]">
              三個步驟,
              <br />
              整理好你的網路名片。
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                <p className="text-2xl font-black">{s.n}</p>
                <p className="mt-2 text-[15px] font-bold">{s.title}</p>
                <p className="mt-1.5 text-xs leading-6 text-[#77716b]">{s.body}</p>
                {i < STEPS.length - 1 ? <span className="absolute -right-5 top-8 hidden text-lg text-[#c9c3bb] sm:block">⟶</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 功能 */}
      <section id="features" className="scroll-mt-16 bg-[#f4f3f0]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_2.2fr] lg:py-20">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.25em] text-[#a8a29b]">FEATURES</p>
            <h2 className="mt-2 text-2xl font-black leading-snug sm:text-[28px]">
              不只是連結,
              <br />
              也可以很好看。
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#77716b]">從版型、連結到數據,URBANLINKS 提供你整理自己所需要的工具。</p>
            <Link href={start} className="mt-7 inline-flex items-center gap-2 rounded-md bg-[#1f1b19] px-5 py-3 text-xs font-semibold text-white">
              探索所有功能 <Arrow />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard title="多種風格版型" body="拍立得、雜誌、報紙、滿版照片⋯選一個喜歡的,變成你的樣子。">
              <div className="relative h-32 w-full">
                {[
                  ['#2b2b2b', '#5a5a5a', '-8deg', '8%'],
                  ['#e9e4da', '#c9bfae', '0deg', '36%'],
                  ['#9cc3ea', '#4f7fb4', '8deg', '64%'],
                ].map(([a, b, r, left]) => (
                  <span key={left} className="absolute top-2 h-28 w-[30%] rounded-xl border-[3px] border-[#1f1b19] shadow-md" style={{ left, transform: `rotate(${r})`, background: `linear-gradient(160deg, ${a}, ${b})` }}>
                    <span className="mx-auto mt-3 block h-5 w-5 rounded-full bg-white/80" />
                    <span className="mx-2 mt-2 block h-1.5 rounded bg-white/70" />
                    <span className="mx-2 mt-1.5 block h-1.5 rounded bg-white/50" />
                    <span className="mx-2 mt-1.5 block h-1.5 rounded bg-white/50" />
                  </span>
                ))}
              </div>
            </FeatureCard>

            <FeatureCard title="圖文連結" body="不只文字,還可以放上照片、圖示與說明,讓你的連結更有個人風格。">
              <div className="w-full space-y-1.5">
                {[['#d9c7b4', '精選作品'], ['#b9c8d6', '新品介紹'], ['#c9d3bf', '合作邀約'], ['#e2c9c9', '預約諮詢']].map(([c, t]) => (
                  <div key={t} className="flex items-center gap-2 rounded-lg border border-[#ece9e3] p-1.5">
                    <span className="h-7 w-7 shrink-0 rounded-md" style={{ background: c }} />
                    <span className="text-[11px] font-medium">{t}</span>
                  </div>
                ))}
              </div>
            </FeatureCard>

            <FeatureCard title="流量數據" body="看看有多少人來過、從哪裡來,最常點哪個連結。">
              <div className="w-full">
                <div className="flex items-end justify-between rounded-lg border border-[#ece9e3] p-2.5">
                  <div>
                    <p className="text-[10px] text-[#8a847d]">總瀏覽次數</p>
                    <p className="flex items-center gap-1.5 text-base font-bold">12,593 <span className="rounded bg-[#eefbd0] px-1 text-[9px] font-semibold text-[#4d7a0c]">+12%</span></p>
                  </div>
                  <svg width="70" height="28" viewBox="0 0 70 28" fill="none" aria-hidden="true"><path d="M1 24 L12 20 L22 22 L33 14 L44 16 L55 7 L69 3" stroke="#2f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="mt-2 space-y-1.5">
                  {[['Instagram', 46], ['LINE', 28], ['Facebook', 16], ['直接進入', 10]].map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-[10px]">
                      <span className="w-14 text-[#55504a]">{k}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0eeea]"><span className="block h-full rounded-full bg-[#2f6fe0]" style={{ width: `${(Number(v) / 46) * 100}%` }} /></span>
                      <span className="w-7 text-right text-[#8a847d]">{v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </FeatureCard>

            <FeatureCard title="限時顯示" body="重要的連結,可以設定顯示時間,活動結束後自動隱藏。">
              <div className="w-full rounded-xl border border-[#ece9e3] p-3 shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
                <p className="text-[10px] font-semibold">限時活動</p>
                <p className="mt-1.5 flex items-baseline gap-2 text-[11px] text-[#55504a]">
                  剩餘 <span className="text-base font-bold text-[#1f1b19]">3</span> 天
                  <span className="font-mono text-base font-bold tracking-wider text-[#1f1b19]">12:06:24</span>
                </p>
              </div>
            </FeatureCard>

            <FeatureCard title="QR Code 與分享連結" body="一鍵產生 QR Code,放進名片、海報或社群,讓更多人找到你。">
              <div className="flex w-full flex-col items-center gap-3">
                <span className="block h-20 w-20 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
                <span className="w-full truncate rounded-md border border-[#ece9e3] px-2.5 py-1.5 text-center text-[10px] text-[#55504a]">urbanite.com.tw/@yourname</span>
              </div>
            </FeatureCard>

            <FeatureCard title="更多實用功能" body="社群追蹤卡片、影片、LINE 加好友、商品卡⋯從一張名片,延伸成完整的品牌官網。">
              <div className="grid w-full grid-cols-3 gap-2">
                {[
                  <path key="l" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
                  <g key="i"><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8 8" /></g>,
                  <g key="c"><path d="M4 5h2l2 10h10l2-7H7" /><circle cx="9.5" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></g>,
                  <g key="m"><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M4 7l8 6 8-6" /></g>,
                  <g key="u"><circle cx="12" cy="9" r="3.4" /><path d="M5.5 19c.9-3.2 3.4-5 6.5-5s5.6 1.8 6.5 5" /></g>,
                  <g key="d"><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /></g>,
                ].map((icon, i) => (
                  <span key={i} className="flex h-10 items-center justify-center rounded-full border border-[#ece9e3] text-[#3a3632]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
                  </span>
                ))}
              </div>
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* 編輯器展示 */}
      <section id="showcase" className="scroll-mt-16 overflow-hidden bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.4fr] lg:py-24">
          <div>
            <h2 className="text-[30px] font-black leading-[1.3] sm:text-[38px]">
              你的連結,
              <br />
              不該只是一排按鈕。
            </h2>
            <p className="mt-6 text-sm leading-8 text-[#55504a]">
              每個人都有不同的樣子。
              <br />
              你可以是創作者、品牌主、接案工作者,
              <br />
              或只是想把自己的資訊整理得好看一點。
              <br />
              用 URBANLINKS,把重要的,都放在同一頁。
            </p>
            <p className={`${script.className} mt-4 -rotate-2 text-2xl text-[#a8a29b]`}>Make it yours.</p>
          </div>

          <div className="relative">
            <p className="absolute -top-8 right-6 -rotate-3 text-xs tracking-[0.1em] text-[#8a847d]">拖曳編輯,輕鬆完成!</p>
            <div className="overflow-hidden rounded-xl border border-[#e3e0da] bg-[#fafaf8] shadow-[0_30px_60px_rgba(31,27,25,0.14)]">
              <div className="flex items-center justify-between border-b border-[#ece9e3] bg-white px-4 py-2.5">
                <img src={SERVICE_LOGO} alt="" className="h-2.5 w-auto" />
                <span className="flex gap-1.5">
                  <span className="h-4 w-10 rounded bg-[#f0eeea]" />
                  <span className="h-4 w-10 rounded bg-[#1f1b19]" />
                </span>
              </div>
              <div className="grid grid-cols-[1fr_1.15fr_0.9fr] gap-3 p-3 sm:p-4">
                <div className="space-y-2">
                  <p className="text-[9px] font-semibold text-[#8a847d]">我的名片</p>
                  {['#d9c7b4', '#b9c8d6', '#c9d3bf', '#e2c9c9'].map((c) => (
                    <div key={c} className="flex items-center gap-1.5 rounded-md border border-[#ece9e3] bg-white p-1.5">
                      <span className="text-[8px] text-[#c9c3bb]">⋮⋮</span>
                      <span className="h-7 w-7 shrink-0 rounded" style={{ background: c }} />
                      <span className="h-1.5 flex-1 rounded bg-[#ece9e3]" />
                    </div>
                  ))}
                </div>
                <div className="mx-auto h-[290px] w-full max-w-[150px] overflow-hidden rounded-[18px] border-4 border-[#1f1b19] bg-white">
                  <DemoPhone card={demoCard('framed-wood', 'Chloe', 'Illustrator|插畫家', avatar('#e9c9a8', '#8a5a35', 'C'), cover('#d8c3a5', '#9a7b57'), ['插畫'])} blocks={[block('d1', '作品集'), block('d2', '委託須知'), block('d3', '商品店舖'), block('d4', '聯絡我')]} />
                </div>
                <div className="space-y-2.5">
                  <p className="text-[9px] font-semibold text-[#8a847d]">版面編輯</p>
                  {['背景', '文字', '按鈕'].map((t) => (
                    <div key={t}>
                      <p className="text-[8px] text-[#8a847d]">{t}</p>
                      <span className="mt-1 block h-1.5 rounded bg-[#ece9e3]" />
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    {['#1f1b19', '#8a7f72', '#c9b79c', '#e8e2d8'].map((c) => <span key={c} className="h-4 w-4 rounded-full ring-1 ring-black/5" style={{ background: c }} />)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-[#8a847d]">顯示頭像</span>
                    <span className="flex h-3 w-6 items-center justify-end rounded-full bg-[#1f1b19] px-0.5"><span className="h-2 w-2 rounded-full bg-white" /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-[#8a847d]">陰影</span>
                    <span className="flex h-3 w-6 items-center rounded-full bg-[#e3e0da] px-0.5"><span className="h-2 w-2 rounded-full bg-white" /></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 方案 */}
      <section id="pricing" className="scroll-mt-16 border-t border-[#ece9e3] bg-[#fafaf8]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.7fr_3fr] lg:py-20">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.25em] text-[#a8a29b]">PLANS</p>
            <h2 className="mt-2 text-xl font-black leading-snug sm:text-2xl">選一個適合<br className="hidden lg:block" />你的開始。</h2>
            <p className="mt-3 text-xs leading-6 text-[#77716b]">從個人名片到品牌官網,都能在 URBANLINKS 完成。付費方案都是預付制,不會自動扣款。</p>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TIERS.map((t) => {
                const dark = t.key === 'plus';
                const copy = PLAN_COPY[t.key];
                return (
                  <div key={t.key} className={`flex flex-col rounded-2xl p-5 ${dark ? 'bg-[#1f1b19] text-white shadow-[0_20px_40px_rgba(31,27,25,0.25)]' : 'border border-[#e3e0da] bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold">{t.name}</p>
                      {dark ? <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-[#1f1b19]" style={{ background: LIME }}>最受歡迎</span> : null}
                    </div>
                    <p className="mt-2 text-lg font-bold">
                      {t.prices ? <>NT$ {t.prices.month}<span className={`text-xs font-normal ${dark ? 'text-white/60' : 'text-[#8a847d]'}`}> / 月</span></> : '免費'}
                    </p>
                    <p className={`text-[11px] ${dark ? 'text-white/50' : 'text-[#a8a29b]'}`}>{t.prices ? `(年付 NT$ ${t.prices.year.toLocaleString()})` : '一直免費使用'}</p>
                    <p className="mt-4 text-[13px] font-semibold">{copy.who}</p>
                    <p className={`mt-1 text-xs leading-5 ${dark ? 'text-white/65' : 'text-[#77716b]'}`}>{copy.desc}</p>
                    <ul className={`mt-4 space-y-2 border-t pt-4 text-xs ${dark ? 'border-white/10' : 'border-[#ece9e3]'}`}>
                      {copy.items.map((item) => (
                        <li key={item} className="flex gap-2"><Check light={dark} />{item}</li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-6">
                      {t.key === 'free' ? (
                        <Link href={start} className="flex items-center justify-center gap-1.5 rounded-md bg-[#1f1b19] py-2.5 text-xs font-semibold text-white">免費開始 <Arrow /></Link>
                      ) : t.available ? (
                        <Link href={upgradeHref} className="flex items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-bold text-[#1f1b19]" style={{ background: LIME }}>立即升級 <Arrow /></Link>
                      ) : (
                        <a href={CONTACT_LINE_URL} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-md border border-[#1f1b19] py-2.5 text-xs font-semibold">聯繫專員 <Arrow /></a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <details className="group mt-5">
              <summary className="cursor-pointer list-none text-center text-xs text-[#55504a] underline underline-offset-4">
                <span className="group-open:hidden">看完整功能比較</span>
                <span className="hidden group-open:inline">收合功能比較</span>
              </summary>
              <div className="mt-4">
                <TierTable />
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* 常見問題 */}
      <section id="faq" className="scroll-mt-16 border-t border-[#ece9e3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_2.2fr]">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.25em] text-[#a8a29b]">FAQ</p>
            <h2 className="mt-2 text-2xl font-black">常見問題</h2>
            <p className="mt-3 text-xs leading-6 text-[#77716b]">
              還有其他問題?
              <br />
              <a href={CONTACT_LINE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">加入官方 LINE</a> 聯繫我們的專員。
            </p>
          </div>
          <div className="divide-y divide-[#ece9e3] border-y border-[#ece9e3]">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                  {f.q}
                  <span className="shrink-0 text-lg leading-none text-[#8a847d] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 pr-8 text-[13px] leading-7 text-[#77716b]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 結尾行動呼籲 */}
      <section className="relative overflow-hidden bg-[#1b1a18] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(255,255,255,0.10),transparent_55%),radial-gradient(ellipse_at_85%_80%,rgba(212,245,60,0.08),transparent_50%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-[10px] font-semibold leading-5 tracking-[0.25em] text-white/50">YOUR STORY<br />ONE LINK</p>
          <div className="mt-4 text-center">
            <h2 className="text-2xl font-black leading-snug sm:text-[30px]">
              現在就做一張,
              <br />
              把散落在不同地方的你,整理在同一頁。
            </h2>
            <Link href={start} className="mt-8 inline-flex items-center gap-2 rounded-md px-7 py-3.5 text-sm font-bold text-[#1f1b19]" style={{ background: LIME }}>
              {user ? '編輯我的名片' : '免費建立我的頁面'} <Arrow />
            </Link>
          </div>
          <p className="mt-6 text-right text-xs tracking-[0.1em] text-white/50 sm:-mt-10">從一個連結,開始更多可能。</p>
        </div>
      </section>

      {/* 頁尾 */}
      <footer className="border-t border-[#ece9e3] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
          <div>
            <img src={SERVICE_LOGO} alt="URBANLINKS" className="h-4 w-auto" />
            <p className={`${script.className} mt-1 text-base text-[#a8a29b]`}>More than a link.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#55504a] sm:mx-auto">
            <a href="#features">功能介紹</a>
            <a href="#pricing">方案價格</a>
            <a href="#cases">作品案例</a>
            <a href="#faq">常見問題</a>
            <a href={CONTACT_LINE_URL} target="_blank" rel="noreferrer">聯絡我們</a>
          </nav>
          <p className="text-[11px] text-[#a8a29b]">© {new Date().getFullYear()} URBANLINKS</p>
        </div>
      </footer>
    </main>
  );
}
