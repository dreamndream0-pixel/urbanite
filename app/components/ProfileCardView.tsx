'use client';

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import SocialIcon from '@/app/components/SocialIcon';
import ProfileImageBlock from '@/app/components/ProfileImageBlock';
import {
  detectSource,
  FONT_OPTIONS,
  isBlockComplete,
  isDarkColor,
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
  const dark = isDarkColor(theme.bgColor);
  // 卡片 / 標籤底色:淺色背景用白,深色背景用半透明白
  const surface = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)';
  const surfaceSoft = dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)';
  const showAvatar = theme.showAvatar !== false && Boolean(card.avatar_url);
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
        : theme.bgType === 'gradient'
          ? { backgroundImage: `linear-gradient(180deg, ${theme.bgColor}, ${theme.bgColor2})`, backgroundAttachment: fullScreen ? 'fixed' : undefined }
          : theme.bgType === 'dots'
            ? { backgroundImage: `radial-gradient(${tint(theme.textColor, 14)} 1.3px, transparent 1.6px)`, backgroundSize: '18px 18px' }
            : theme.bgType === 'stripes'
              ? { backgroundImage: `repeating-linear-gradient(135deg, ${tint(theme.textColor, 6)} 0 2px, transparent 2px 16px)` }
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
    background: theme.buttonFill === 'outline' ? 'transparent' : surface,
    border: `1px solid ${tint(theme.textColor, 12)}`,
    boxShadow: theme.buttonShadow ? '0 6px 18px rgba(0,0,0,0.06)' : undefined,
  };
  const layout = theme.layout ?? 'classic';
  const name = card.display_name || card.slug;
  const avatarRound = theme.avatarShape === 'circle' ? 'rounded-full' : 'rounded-2xl';
  const avatar = (className: string, style?: CSSProperties) => (
    <div className={`shrink-0 overflow-hidden bg-white ${className}`} style={style ?? { border: `1px solid ${tint(theme.textColor, 12)}` }}>
      <img src={card.avatar_url} alt={name} className={`h-full w-full ${theme.avatarShape === 'portrait' ? 'object-cover' : 'object-contain'}`} />
    </div>
  );
  const arrow = <span className="shrink-0 text-base leading-none opacity-50">›</span>;

  // 名稱以外的資料:依版型決定排列方向,疊在照片上時改白字
  const info = (align: 'left' | 'center', light = false) => {
    const center = align === 'center';
    const muted = light ? 'rgba(255,255,255,0.88)' : theme.mutedColor;
    const line = light ? 'rgba(255,255,255,0.5)' : tint(theme.textColor, 15);
    const chip = light ? 'rgba(255,255,255,0.12)' : surfaceSoft;
    const justify = center ? 'justify-center' : 'justify-start';
    const textAlign = center ? 'text-center' : 'text-left';
    return {
      tags:
        card.show_tags && card.tags.length > 0 ? (
          <div className={`mt-3 flex flex-wrap gap-1.5 ${justify}`}>
            {card.tags.map((tag) => (
              <span key={tag} className="rounded-full px-3 py-1 text-xs" style={{ border: `1px solid ${line}`, color: muted, background: chip }}>{tag}</span>
            ))}
          </div>
        ) : null,
      socials:
        socials.length > 0 ? (
          <div className={`mt-4 flex flex-wrap gap-2 ${justify}`}>
            {socials.map((sc, i) => (
              <a
                key={`${sc.type}-${i}`}
                href={socialUrl(sc)}
                target="_blank"
                rel="noreferrer"
                aria-label={SOCIAL_PLATFORMS.find((p) => p.type === sc.type)?.label ?? sc.type}
                className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-75"
                style={{ border: `1px solid ${line}`, background: chip, color: light ? '#ffffff' : theme.textColor }}
              >
                <SocialIcon type={sc.type} />
              </a>
            ))}
          </div>
        ) : null,
      bio:
        card.show_bio && card.bio ? (
          <p className={`mt-3 whitespace-pre-line text-sm leading-6 ${textAlign} ${center ? 'mx-auto max-w-[340px]' : ''}`} style={{ color: muted }}>{card.bio}</p>
        ) : null,
      email:
        card.show_email && card.email ? (
          <a href={`mailto:${card.email}`} className={`mt-2 block text-xs underline-offset-2 hover:underline ${textAlign}`} style={{ color: muted }}>{card.email}</a>
        ) : null,
    };
  };

  const coverBand = (className: string) => (
    <div className={`-mx-5 self-stretch overflow-hidden ${className}`} style={{ background: theme.bandColor }}>
      {theme.coverImage ? <img src={theme.coverImage} alt="" className="h-full w-full object-cover" /> : null}
    </div>
  );

  let header: ReactNode;
  if (layout === 'hero') {
    // 滿版封面:封面照(沒有時用大頭照)延伸到簡介,文字疊在底部漸層上
    const image = theme.coverImage || (showAvatar ? card.avatar_url : '');
    const p = info('center', true);
    header = (
      <div className="relative -mx-5 flex flex-col justify-end self-stretch overflow-hidden" style={{ aspectRatio: '4 / 5', background: theme.bandColor }}>
        {image ? <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.8) 100%)' }} />
        <div className="relative flex flex-col items-center px-6 pb-7 pt-32 text-center text-white">
          {showAvatar && theme.coverImage ? avatar('h-16 w-16 rounded-full', { border: '2px solid rgba(255,255,255,0.9)' }) : null}
          <h1 className="mt-3 text-[26px] font-bold tracking-[0.06em]">{name}</h1>
          {p.bio}
          {p.email}
          {p.tags}
          {p.socials}
        </div>
      </div>
    );
  } else if (layout === 'card') {
    // 名片卡:頂部封面/色塊+浮起的資料卡
    const p = info('center');
    header = (
      <>
        {coverBand('h-40')}
        <div
          className="relative -mt-20 flex w-full flex-col items-center rounded-3xl px-5 pb-6 pt-5 text-center"
          style={{ background: dark ? `color-mix(in srgb, ${theme.bgColor} 90%, white)` : '#ffffff', border: `1px solid ${tint(theme.textColor, 8)}`, boxShadow: '0 12px 32px rgba(0,0,0,0.1)' }}
        >
          {showAvatar ? avatar(`-mt-14 h-20 w-20 ${avatarRound}`, { border: `3px solid ${dark ? theme.bgColor : '#ffffff'}` }) : null}
          <h1 className={`${showAvatar ? 'mt-3' : 'mt-1'} text-[21px] font-semibold tracking-[0.04em]`}>{name}</h1>
          {p.tags}
          {p.bio}
          {p.email}
          {p.socials}
        </div>
      </>
    );
  } else if (layout === 'split') {
    // 左右並排:大頭照在左、名稱與 E-mail 在右
    const cover = Boolean(theme.coverImage || theme.headerBand);
    const p = info('left');
    header = (
      <div className="w-full">
        {cover ? coverBand('aspect-[3/1]') : null}
        <div className={`flex items-end gap-4 ${cover ? '' : 'pt-12'}`}>
          {showAvatar ? avatar(`h-24 w-24 ${avatarRound} ${cover ? '-mt-10' : ''}`, cover ? { border: `3px solid ${theme.bgColor}` } : undefined) : null}
          <div className={`min-w-0 flex-1 pb-1 ${!showAvatar && cover ? 'pt-5' : ''}`}>
            <h1 className="text-[22px] font-semibold leading-7 tracking-[0.03em]">{name}</h1>
            {p.email}
          </div>
        </div>
        {p.bio}
        {p.tags}
        {p.socials}
      </div>
    );
  } else if (layout === 'magazine') {
    // 雜誌大圖:大字名稱+直式大照片
    const image = theme.coverImage || (showAvatar ? card.avatar_url : '');
    const p = info('left');
    header = (
      <div className="w-full pt-12">
        <h1 className="text-[34px] font-bold leading-[1.12] tracking-[0.02em]">{name}</h1>
        {p.tags}
        {image ? (
          <div className="mt-5 aspect-[4/5] w-full overflow-hidden" style={{ borderRadius: Math.min(radius, 24) }}>
            <img src={image} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        {p.bio}
        {p.email}
        {p.socials}
      </div>
    );
  } else if (layout === 'minimal') {
    // 極簡:小頭像與名稱同一行,細線分隔
    const p = info('left');
    header = (
      <div className="w-full pt-14">
        {theme.coverImage ? (
          <div className="mb-6 aspect-[3/1] w-full overflow-hidden" style={{ borderRadius: Math.min(radius, 18) }}>
            <img src={theme.coverImage} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {showAvatar ? avatar(`h-14 w-14 ${avatarRound}`) : null}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-[0.03em]">{name}</h1>
            {p.email ? <div className="-mt-1">{p.email}</div> : null}
          </div>
        </div>
        <div className="mt-5 h-px w-full" style={{ background: tint(theme.textColor, 15) }} />
        {p.bio}
        {p.tags}
        {p.socials}
      </div>
    );
  } else {
    // 經典置中(可在簡介樣式改成靠左)
    const cover = Boolean(theme.coverImage || theme.headerBand);
    const p = info(left ? 'left' : 'center');
    const avatarClass =
      theme.avatarShape === 'portrait' ? 'aspect-[4/5] w-28 rounded-2xl' : theme.avatarShape === 'square' ? 'h-24 w-24 rounded-2xl' : 'h-24 w-24 rounded-full';
    header = (
      <div className={`flex w-full flex-col ${left ? 'items-start' : 'items-center'} ${cover ? '' : 'pt-12'}`}>
        {cover ? coverBand('aspect-[5/2]') : null}
        {showAvatar ? avatar(`relative ${avatarClass} ${cover ? '-mt-12' : ''}`, cover ? { border: `3px solid ${theme.bgColor}` } : undefined) : null}
        <h1 className={`${showAvatar || !cover ? 'mt-4' : 'mt-6'} text-[22px] font-semibold tracking-[0.04em] ${left ? 'text-left' : 'text-center'}`}>{name}</h1>
        {p.tags}
        {p.socials}
        {p.bio}
        {p.email}
      </div>
    );
  }

  // 連結按鈕:置中按鈕 / 靠左按鈕 / 清單 / 圖卡
  function renderLink(b: ProfileCardBlock) {
    const common = { href: normalizeUrl(b.url), target: '_blank', rel: 'noreferrer', onClick: () => track(b.id) };
    const thumbRadius = Math.max(Math.min(radius, 16) - 6, 2);
    if (theme.linkStyle === 'left') {
      return (
        <a key={b.id} {...common} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 text-left text-sm font-medium leading-5 transition hover:opacity-85" style={buttonStyle}>
          {b.image ? <img src={b.image} alt="" className="h-10 w-10 shrink-0 bg-white object-cover" style={{ borderRadius: thumbRadius }} /> : null}
          <span className="min-w-0 flex-1 pl-1">{b.title}</span>
          {arrow}
        </a>
      );
    }
    if (theme.linkStyle === 'list') {
      return (
        <a key={b.id} {...common} className="flex min-h-[56px] items-center gap-3 py-2.5 text-left text-sm font-medium leading-5 transition hover:opacity-70" style={{ borderBottom: `1px solid ${tint(theme.textColor, 15)}`, color: theme.textColor }}>
          {b.image ? <img src={b.image} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-cover" /> : null}
          <span className="min-w-0 flex-1">{b.title}</span>
          {arrow}
        </a>
      );
    }
    if (theme.linkStyle === 'card') {
      return (
        <a
          key={b.id}
          {...common}
          className="block overflow-hidden transition hover:opacity-90"
          style={{ borderRadius: Math.min(radius, 18), border: `1.5px solid ${theme.buttonFill === 'soft' ? tint(theme.textColor, 15) : theme.buttonColor}`, background: surface, color: theme.textColor, boxShadow: theme.buttonShadow ? '0 6px 18px rgba(0,0,0,0.06)' : undefined }}
        >
          <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium leading-5">
            <span className="min-w-0 flex-1">{b.title}</span>
            {b.image ? null : arrow}
          </span>
          {b.image ? (
            <span className="block px-3 pb-3">
              <img src={b.image} alt="" className="aspect-[16/9] w-full bg-white object-cover" style={{ borderRadius: Math.max(Math.min(radius, 18) - 6, 4) }} />
            </span>
          ) : null}
        </a>
      );
    }
    return (
      <a key={b.id} {...common} className="relative flex min-h-[56px] items-center justify-center px-14 py-3 text-center text-sm font-medium leading-5 transition hover:opacity-85" style={buttonStyle}>
        {b.image ? <img src={b.image} alt="" className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 bg-white object-cover" style={{ borderRadius: Math.max(radius - 6, 2) }} /> : null}
        {b.title}
      </a>
    );
  }

  return (
    <div className={fullScreen ? 'min-h-screen' : 'min-h-full'} style={pageStyle}>
      <div className={`mx-auto flex max-w-[440px] flex-col px-5 pb-10 ${left && layout === 'classic' ? 'items-start' : 'items-center'}`}>
        {header}

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
                  {b.title ? <p className="px-3 py-2 text-sm" style={{ background: surface }}>{b.title}</p> : null}
                </div>
              );
            }
            if (b.type === 'image') {
              return <ProfileImageBlock key={b.id} block={b} radius={radius} colors={{ ...theme, surface }} onOpen={() => track(b.id)} />;
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
            return renderLink(b);
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
