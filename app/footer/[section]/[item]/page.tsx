import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SiteSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TITLES: Record<string, string> = {
  about: '關於我們 ABOUT US',
  service: '顧客服務 SERVICE',
  find: '尋找我們 FOLLOW US',
};

export default async function FooterContentPage({ params }: { params: Promise<{ section: string; item: string }> }) {
  const { section, item } = await params;
  const itemTitle = decodeURIComponent(item);
  const supabase = createAdminClient();
  const { data } = await supabase.from('site_settings').select('footer_sections').eq('id', 1).single();
  const settings = data as Pick<SiteSettings, 'footer_sections'> | null;
  const sections = settings?.footer_sections ?? [];
  const sectionData = sections.find((entry) => {
    if (section === 'service') return /顧客|客服|service/i.test(entry.title);
    if (section === 'find') return /尋找|follow|聯絡|contact/i.test(entry.title);
    return !/顧客|客服|service|尋找|follow|聯絡|contact/i.test(entry.title);
  });
  const content = sectionData?.items.find((entry) => entry.subtitle === itemTitle);
  if (!content) notFound();

  return (
    <main className="min-h-screen bg-white text-[#2c2826]">
      <header className="border-b border-[#e5ded4] px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="text-sm text-[#6b6156]">← 回首頁</Link>
          <h1 className="text-lg font-bold tracking-wide">{TITLES[section] ?? '頁尾資訊'}</h1>
          <span className="w-14" />
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#b64b43]">{content.subtitle}</p>
        <h2 className="mt-4 text-3xl font-bold">{content.subtitle}</h2>
        <div className="mt-8 whitespace-pre-wrap text-base leading-8 text-[#494541]">{content.content}</div>
        {content.url && <a href={content.url} className="mt-8 inline-block underline" target={content.url.startsWith('http') ? '_blank' : undefined} rel={content.url.startsWith('http') ? 'noreferrer' : undefined}>前往相關連結</a>}
      </article>
    </main>
  );
}
