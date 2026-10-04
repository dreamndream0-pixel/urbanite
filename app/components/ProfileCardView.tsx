'use client';

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import SocialIcon from '@/app/components/SocialIcon';
import ProfileImageBlock from '@/app/components/ProfileImageBlock';
import {
  detectSource,
  FONT_OPTIONS,
  isBlockComplete,
  isBlockInWindow,
  normalizeUrl,
  resolveTheme,
  socialUrl,
  SOCIAL_PLATFORMS,
  videoEmbedUrl,
  type ProfileCard,
  type ProfileCardBlock,
} from '@/lib/profile-card';

export type CardProduct = { id: string; name: string; price: number; original_price: number | null; image: string };

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

// 半透明色(依主題色調整邊框、分隔線)
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// 個人名片頁(前台與後台預覽共用),外觀依 card.theme
export default function ProfileCardView({
  card,
  blocks,
  products,
  logoUrl = '',
  lineUrl = '',
  preview = false,
  fullScreen = false,
}: {
  card: ProfileCard;
  blocks: ProfileCardBlock[];
  products: Record<string, CardProduct>;
  logoUrl?: string;
  lineUrl?: string;
  preview?: boolean;
  fullScreen?: boolean;
}) {
  const theme = resolveTheme(card.theme);
  const left = theme.align === 'left';
  const source = useRef('direct');

  const visible = useMemo(
    () =>
      blocks.filter(
        (b) =>
          b.enabled &&
          isBlockComplete(b) &&
          isBlockInWindow(b) &&
          (b.type !== 'product' || products[b.product_id]) &&
          (b.type !== 'line' || b.url || lineUrl),
      ),
    [blocks, products, lineUrl],
  );
  const socials = card.show_socials ? card.socials.filter((s) => s.value.trim()) : [];

  // 瀏覽計數:同一個分頁、同一天只算一次
  useEffect(() => {
    if (preview) return;
    try {
      const params = new URLSearchParams(window.location.search);
      source.current = detectSource(navigator.userAgent, document.referrer, params.get('utm_source') || params.get('from'));
      const key = `pcv:${card.id}:${new Date().toISOString().slice(0, 10)}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      send({ card_id: card.id, type: 'view', source: source.current });
    } catch {
      /* 計數失敗不影響瀏覽 */
    }
  }, [card.id, preview]);

  function send(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon?.('/api/profile-card/track', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/profile-card/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  }

  function track(blockId: string) {
    if (preview) return;
    try { send({ card_id: card.id, block_id: blockId, type: 'click', source: source.current }); } catch { /* 略過 */ }
  }

  // ---------- 樣式 ----------
  const pageStyle: CSSProperties = {
    color: theme.textColor,
    backgroundColor: theme.bgColor,
    fontFamily: FONT_OPTIONS.find((f) => f.key === theme.font)?.css,
    ...(theme.bgType === 'image' && theme.bgImage
      ? { backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : theme.bgType === 'grid'
        ? {
            backgroundImage: `linear-gradient(${tint(theme.textColor, 7)} 1px, transparent 1px), linear-gradient(90deg, ${tint(theme.textColor, 7)} 1px, transparent 1px)`,
            backgroundSize: '22px 22px',
          }
        : {}),
  };
  const radius = theme.buttonShape === 'pill' ? 9999 : theme.buttonShape === 'rounded' ? 16 : 2;
  const buttonStyle: CSSProperties = {
    borderRadius: radius,
    boxShadow: theme.buttonShadow ? '0 6px 18px rgba(0,0,0,0.08)' : undefined,
    ...(theme.buttonFill === 'outline'
      ? { background: 'transparent', color: theme.buttonTextColor, border: `1.5px solid ${theme.buttonColor}` }
      : { background: theme.buttonColor, color: theme.buttonTextColor, border: `1px solid ${theme.buttonFill === 'soft' ? tint(theme.textColor, 10) : theme.buttonColor}` }),
  };
  const cardStyle: CSSProperties = {
    borderRadius: Math.min(radius, 18),
    background: theme.buttonFill === 'outline' ? 'transparent' : 'rgba(255,255,255,0.85)',
    border: `1px solid ${tint(theme.textColor, 12)}`,
    boxShadow: theme.buttonShadow ? '0 6px 18px rgba(0,0,0,0.06)' : undefined,
  };
  const avatarClass =
    theme.avatarShape === 'portrait'
      ? 'aspect-[4/5] w-28 rounded-2xl'
      : theme.avatarShape === 'square'
        ? 'h-24 w-24 rounded-2xl'
        : 'h-24 w-24 rounded-full';

  return (
    <div className={fullScreen ? 'min-h-screen' : 'min-h-full'} style={pageStyle}>
      <div className={`mx-auto flex max-w-[440px] flex-col px-5 pb-10 pt-12 ${left ? 'items-start' : 'items-center'}`}>
        {card.avatar_url ? (
          <div className={`overflow-hidden bg-white ${avatarClass}`} style={{ border: `1px solid ${tint(theme.textColor, 12)}` }}>
            <img src={card.avatar_url} alt={card.display_name} className={`h-full w-full ${theme.avatarShape === 'portrait' ? 'object-cover' : 'object-contain'}`} />
          </div>
        ) : null}

        <h1 className={`mt-4 text-[22px] font-semibold tracking-[0.04em] ${left ? 'text-left' : 'text-center'}`}>{card.display_name || card.slug}</h1>

        {card.show_tags && card.tags.length > 0 ? (
          <div className={`mt-3 flex flex-wrap gap-1.5 ${left ? 'justify-start' : 'justify-center'}`}>
            {card.tags.map((tag) => (
              <span key={tag} className="rounded-full px-3 py-1 text-xs" style={{ border: `1px solid ${tint(theme.textColor, 15)}`, color: theme.mutedColor, background: 'rgba(255,255,255,0.5)' }}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {socials.length > 0 ? (
          <div className={`mt-4 flex flex-wrap gap-2 ${left ? 'justify-start' : 'justify-center'}`}>
            {socials.map((s, i) => (
              <a
                key={`${s.type}-${i}`}
                href={socialUrl(s)}
                target="_blank"
                rel="noreferrer"
                aria-label={SOCIAL_PLATFORMS.find((p) => p.type === s.type)?.label ?? s.type}
                className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-75"
                style={{ border: `1px solid ${tint(theme.textColor, 15)}`, background: 'rgba(255,255,255,0.7)', color: theme.textColor }}
              >
                <SocialIcon type={s.type} />
              </a>
            ))}
          </div>
        ) : null}

        {card.show_bio && card.bio ? (
          <p className={`mt-4 max-w-[340px] whitespace-pre-line text-sm leading-6 ${left ? 'text-left' : 'text-center'}`} style={{ color: theme.mutedColor }}>
            {card.bio}
          </p>
        ) : null}

        {card.show_email && card.email ? (
          <a href={`mailto:${card.email}`} className="mt-2 text-xs underline-offset-2 hover:underline" style={{ color: theme.mutedColor }}>{card.email}</a>
        ) : null}

        {/* 區塊 */}
        <div className="mt-8 w-full space-y-3">
          {visible.map((b) => {
            if (b.type === 'divider') {
              return <div key={b.id} className="py-2"><div className="h-px w-full" style={{ background: tint(theme.textColor, 14) }} /></div>;
            }
            if (b.type === 'text') {
              return (
                <p key={b.id} className="flex items-center gap-3 pt-3 text-xs tracking-[0.2em]" style={{ color: theme.mutedColor }}>
                  <span className="h-px flex-1" style={{ background: tint(theme.textColor, 12) }} />
                  {b.title}
                  <span className="h-px flex-1" style={{ background: tint(theme.textColor, 12) }} />
                </p>
              );
            }
            if (b.type === 'video') {
              return (
                <div key={b.id} className="overflow-hidden" style={{ borderRadius: Math.min(radius, 18), border: `1px solid ${tint(theme.textColor, 12)}` }}>
                  <iframe
                    src={videoEmbedUrl(b.url)}
                    title={b.title || '影片'}
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                  {b.title ? <p className="px-3 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.85)' }}>{b.title}</p> : null}
                </div>
              );
            }
            if (b.type === 'image') {
              return <ProfileImageBlock key={b.id} block={b} radius={radius} colors={theme} onOpen={() => track(b.id)} />;
            }
            if (b.type === 'product') {
              const p = products[b.product_id];
              return (
                <Link key={b.id} href={`/products/${encodeURIComponent(p.id)}`} onClick={() => track(b.id)} className="flex items-center gap-3 p-3 transition hover:opacity-90" style={cardStyle}>
                  <span className="aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                    {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm font-medium leading-5">{b.title || p.name}</span>
                    <span className="mt-1 flex items-baseline gap-2">
                      <span className="text-sm font-semibold" style={{ color: theme.accentColor }}>{formatter.format(p.price)}</span>
                      {p.original_price && p.original_price > p.price ? (
                        <span className="text-xs line-through" style={{ color: tint(theme.mutedColor, 70) }}>{formatter.format(p.original_price)}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: theme.mutedColor }}>查看 →</span>
                </Link>
              );
            }
            if (b.type === 'line') {
              return (
                <a
                  key={b.id}
                  href={normalizeUrl(b.url || lineUrl)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track(b.id)}
                  className="flex min-h-[56px] items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
                  style={{ borderRadius: radius, background: '#06C755', boxShadow: theme.buttonShadow ? '0 6px 18px rgba(0,0,0,0.08)' : undefined }}
                >
                  <SocialIcon type="line" size={20} />
                  {b.title || '加入官方 LINE'}
                </a>
              );
            }
            return (
              <a
                key={b.id}
                href={normalizeUrl(b.url)}
                target="_blank"
                rel="noreferrer"
                onClick={() => track(b.id)}
                className="relative flex min-h-[56px] items-center justify-center px-14 py-3 text-center text-sm font-medium leading-5 transition hover:opacity-85"
                style={buttonStyle}
              >
                {b.image ? (
                  <img src={b.image} alt="" className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 bg-white object-cover" style={{ borderRadius: Math.max(radius - 6, 2) }} />
                ) : null}
                {b.title}
              </a>
            );
          })}
        </div>

        {card.show_footer_logo !== false ? (
          <Link href="/" className="mt-12 flex w-full justify-center opacity-70 transition hover:opacity-100">
            {logoUrl ? <img src={logoUrl} alt="URBANITE" className="h-5 w-auto object-contain" /> : <span className="text-xs tracking-[0.3em]">URBANITE</span>}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
