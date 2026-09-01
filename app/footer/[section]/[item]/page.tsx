import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Banner, SiteSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const copyrightStartYear = 2025;

export default async function FooterContentPage({ params }: { params: Promise<{ section: string; item: string }> }) {
  const { section, item } = await params;
  const sectionTitle = decodeURIComponent(section);
  const itemTitle = decodeURIComponent(item);
  const supabase = createAdminClient();
  const [{ data: settingsData }, { data: bannerData }] = await Promise.all([
    supabase.from('site_settings').select('footer_sections,logo_url').eq('id', 1).single(),
    supabase.from('banners').select('image,title').eq('active', true).order('sort_order', { ascending: true }).limit(1).maybeSingle(),
  ]);
  const settings = settingsData as Pick<SiteSettings, 'footer_sections' | 'logo_url'> | null;
  const banner = bannerData as Pick<Banner, 'image' | 'title'> | null;
  const sections = settings?.footer_sections ?? [];
  const sectionData = sections.find((entry) => entry.title === sectionTitle);
  const content = sectionData?.items.find((entry) => entry.subtitle === itemTitle);
  if (!content) notFound();

  const body = content.content?.trim() ?? '';
  const paragraphs = body
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean);
  const intro = paragraphs.slice(0, 3);
  const copyrightEndYear = Math.max(copyrightStartYear, new Date().getFullYear());

  return (
    <main className="min-h-screen bg-[#f8f3ec] text-[#2c2826]">
      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-8 sm:px-8 lg:min-h-[520px] lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-12">
        <div className="order-2 lg:order-1">
          <Link href="/" className="text-sm font-semibold text-[#6f675f] hover:text-[#1f1b19]">
            ← 回首頁
          </Link>
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.28em] text-[#9a8f84]">
            About Urbanite
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-wide sm:text-4xl">
            {content.subtitle}
          </h1>
          <div className="mt-6 h-px w-14 bg-[#9a8f84]" />
          <div className="mt-8 space-y-5 text-sm leading-8 text-[#514b45] sm:text-base">
            {intro.map((text, index) => (
              <p key={index} className="whitespace-pre-line">{text}</p>
            ))}
          </div>
        </div>

        <div className="order-1 overflow-hidden rounded-[28px] bg-[#e9e1d6] shadow-sm lg:order-2">
          {banner?.image ? (
            <img src={banner.image} alt={banner.title || 'URBANITE'} className="aspect-[4/3] h-full w-full object-cover lg:aspect-[5/4]" />
          ) : (
            <div className="aspect-[4/3] bg-[linear-gradient(135deg,#e9e1d6,#f8f3ec_48%,#d8cdc1)] lg:aspect-[5/4]" />
          )}
        </div>
      </section>

      <section className="border-y border-[#e5ded4] bg-[#fbf8f4]">
        <div className="mx-auto grid max-w-7xl gap-5 px-6 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          <FeatureItem icon="box" title="嚴選商品" text="精選日常穿搭與質感單品，注重品質與細節。" />
          <FeatureItem icon="shirt" title="日常實穿" text="舒適剪裁與實用材質，讓穿搭更有型。" />
          <FeatureItem icon="truck" title="快速出貨" text="商品現貨快速出貨，安心購物體驗。" />
          <FeatureItem icon="service" title="貼心服務" text="任何問題歡迎聯繫，我們會盡快協助。" />
        </div>
      </section>

      <article className="mx-auto max-w-4xl px-6 py-12 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9a8f84]">{sectionTitle}</p>
        <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{content.subtitle}</h2>
        <div className="mt-8 whitespace-pre-wrap text-base leading-9 text-[#494541]">
          {body}
        </div>
        {content.url && (
          <a
            href={content.url}
            className="mt-10 inline-flex bg-[#1f1b19] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#3a322e]"
            target={content.url.startsWith('http') ? '_blank' : undefined}
            rel={content.url.startsWith('http') ? 'noreferrer' : undefined}
          >
            前往相關連結
          </a>
        )}
      </article>

      <footer className="border-t border-[#e5ded4] px-6 py-6 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-[#6f675f] sm:flex-row">
          <Link href="/" className="font-bold tracking-wide text-[#1f1b19]">
            {settings?.logo_url ? <img src={settings.logo_url} alt="URBANITE" className="h-8 w-auto object-contain" /> : 'URBANITE'}
          </Link>
          <p>Copyright © {copyrightStartYear}-{copyrightEndYear} URBANITE-TW. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureItem({ icon, title, text }: { icon: 'box' | 'shirt' | 'truck' | 'service'; title: string; text: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d8cdc1] bg-white text-[#6f675f]">
        <FeatureIcon icon={icon} />
      </span>
      <span>
        <strong className="block text-sm font-bold">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-[#6f675f]">{text}</span>
      </span>
    </div>
  );
}

function FeatureIcon({ icon }: { icon: 'box' | 'shirt' | 'truck' | 'service' }) {
  if (icon === 'shirt') {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z" />
      </svg>
    );
  }
  if (icon === 'truck') {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.7" />
        <circle cx="18" cy="18" r="1.7" />
      </svg>
    );
  }
  if (icon === 'service') {
    return (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 12a7 7 0 0 1 14 0v4a3 3 0 0 1-3 3h-2" />
        <path d="M5 12v4h3v-5H5zM19 12v4h-3v-5h3z" />
      </svg>
    );
  }
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7l8-4 8 4-8 4-8-4zM4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}
