'use client';

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import SocialIcon from '@/app/components/SocialIcon';
import ProfileImageBlock from '@/app/components/ProfileImageBlock';
import LinkIcon, { isIconImage } from '@/app/components/LinkIcon';
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
  type CardTheme,
  type ProfileCard,
  type ProfileCardBlock,
} from '@/lib/profile-card';

export type CardProduct = { id: string; name: string; price: number; original_price: number | null; image: string };

// 透明 PNG 縮圖完整顯示、不加白底
const isPng = (url: string) => /\.png(\?|$)/i.test(url);

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
  // 照片型版面:大頭照為主,關閉大頭照時改用封面照
  const photo = showAvatar ? card.avatar_url : theme.coverImage;
  // 白色卡片上的文字(深色主題時改深色字)
  const ink = dark ? '#1f1b19' : theme.textColor;
  const inkMuted = dark ? '#6b6156' : theme.mutedColor;
  const avatar = (className: string, style?: CSSProperties) => (
    <div className={`shrink-0 overflow-hidden bg-white ${className}`} style={style ?? { border: `1px solid ${tint(theme.textColor, 12)}` }}>
      <img src={card.avatar_url} alt={name} className={`h-full w-full ${theme.avatarShape === 'portrait' ? 'object-cover' : 'object-contain'}`} />
    </div>
  );
  const photoImg = (className: string, style?: CSSProperties) =>
    photo ? (
      <div className={`overflow-hidden bg-white/70 ${className}`} style={style}>
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      </div>
    ) : null;
  const arrow = <span className="shrink-0 text-base leading-none opacity-50">›</span>;

  // 名稱以外的資料:依版型決定排列方向與顏色
  type InfoOpts = { align: 'left' | 'center'; light?: boolean; text?: string; muted?: string; tagStyle?: CardTheme['tagStyle']; vertical?: boolean };
  const info = ({ align, light = false, text, muted: mutedColor, tagStyle = theme.tagStyle, vertical = false }: InfoOpts) => {
    const center = align === 'center';
    const color = text ?? (light ? '#ffffff' : theme.textColor);
    const muted = mutedColor ?? (light ? 'rgba(255,255,255,0.88)' : theme.mutedColor);
    const line = light ? 'rgba(255,255,255,0.5)' : tint(color, 18);
    const chip = light ? 'rgba(255,255,255,0.12)' : surfaceSoft;
    const justify = center ? 'justify-center' : 'justify-start';
    const textAlign = center ? 'text-center' : 'text-left';
    const tagCss: CSSProperties =
      tagStyle === 'solid'
        ? { background: color, color: isDarkColor(color) ? '#ffffff' : '#1f1b19' }
        : tagStyle === 'square'
          ? { border: `1px solid ${theme.accentColor}`, color: theme.accentColor, background: 'rgba(255,255,255,0.6)' }
          : { border: `1px solid ${line}`, color: muted, background: chip };
    return {
      tags:
        card.show_tags && card.tags.length > 0 ? (
          <div className={`mt-3 flex flex-wrap gap-1.5 ${justify}`}>
            {card.tags.map((tag) => (
              <span key={tag} className={`px-3 py-1 text-xs ${tagStyle === 'square' ? 'rounded-[3px]' : 'rounded-full'}`} style={tagCss}>{tag}</span>
            ))}
          </div>
        ) : null,
      socials:
        socials.length > 0 ? (
          <div className={`flex gap-2 ${vertical ? 'flex-col' : `mt-4 flex-wrap ${justify}`}`}>
            {socials.map((sc, i) => (
              <a
                key={`${sc.type}-${i}`}
                href={socialUrl(sc)}
                target="_blank"
                rel="noreferrer"
                aria-label={SOCIAL_PLATFORMS.find((p) => p.type === sc.type)?.label ?? sc.type}
                className={`flex items-center justify-center rounded-full transition hover:opacity-75 ${vertical ? 'h-7 w-7' : 'h-10 w-10'}`}
                style={vertical ? { color: theme.accentColor } : { border: `1px solid ${line}`, background: chip, color }}
              >
                <SocialIcon type={sc.type} size={vertical ? 16 : undefined} />
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
  const paperShadow = '0 10px 26px rgba(0,0,0,0.14)';

  // 頭像形狀與文字排列:每個版面都套用
  const shape = theme.avatarShape;
  const al: 'left' | 'center' = theme.align === 'left' ? 'left' : 'center';
  const isLeft = al === 'left';
  const items = isLeft ? 'items-start' : 'items-center';
  const textAl = isLeft ? 'text-left' : 'text-center';
  const round = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';
  const aspect = shape === 'portrait' ? 'aspect-[4/5]' : 'aspect-square';
  const avatarBox = (w: string) => `${w} ${aspect} ${round}`;
  const ringStyle: CSSProperties = { border: '6px solid #ffffff', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' };
  // 大照片:方形 / 直式為滿版,圓形改成置中(或靠左)的大圓
  const bigPhoto = (fullClass: string) =>
    !photo ? null : shape === 'circle' ? (
      <div className={`flex px-5 pt-8 ${isLeft ? 'justify-start' : 'justify-center'}`}>{photoImg('aspect-square w-[72%] rounded-full', ringStyle)}</div>
    ) : (
      <div className={fullClass}>{photoImg(`${aspect} w-full`)}</div>
    );

  let header: ReactNode;
  if (layout === 'hero') {
    // 滿版封面:封面照(沒有時用大頭照)延伸到簡介,文字疊在底部漸層上
    const image = theme.coverImage || (showAvatar ? card.avatar_url : '');
    const p = info({ align: al, light: true });
    header = (
      <div className="relative -mx-5 flex flex-col justify-end self-stretch overflow-hidden" style={{ aspectRatio: '4 / 5', background: theme.bandColor }}>
        {image ? <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.8) 100%)' }} />
        <div className={`relative flex flex-col px-6 pb-7 pt-32 text-white ${items} ${textAl}`}>
          {showAvatar && theme.coverImage ? avatar(avatarBox('w-16'), { border: '2px solid rgba(255,255,255,0.9)' }) : null}
          <h1 className="mt-3 text-[26px] font-bold tracking-[0.06em]">{name}</h1>
          {p.bio}
          {p.email}
          {p.tags}
          {p.socials}
        </div>
      </div>
    );
  } else if (layout === 'polaroid') {
    // 拍立得:斜放的照片+迴紋針+旗幟標籤,下方格紋紙卡
    const p = info({ align: al, text: theme.accentColor, muted: theme.mutedColor });
    header = (
      <div className="relative w-full pt-10">
        <div className="relative z-10 mx-auto w-[74%] -rotate-[5deg] rounded-xl bg-white p-2.5" style={{ boxShadow: paperShadow }}>
          <svg width="26" height="54" viewBox="0 0 26 54" className="absolute -top-6 left-1/2 -translate-x-1/2 rotate-[12deg]" fill="none" stroke="#8a8a8a" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M8 40V12a5 5 0 0 1 10 0v32a8 8 0 0 1-16 0V16" />
          </svg>
          {photoImg(`${aspect} ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'}`) ?? <div className={`${aspect} rounded-lg bg-[#eeeeee]`} />}
        </div>
        {card.show_tags && card.tags.length > 0 ? (
          <div className="absolute right-0 top-14 z-20 flex flex-col items-end gap-2">
            {card.tags.map((tag) => (
              <span key={tag} className="py-1 pl-4 pr-3 text-xs text-white" style={{ background: theme.accentColor, clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 50%)' }}>{tag}</span>
            ))}
          </div>
        ) : null}
        <div
          className={`-mt-12 rounded-2xl px-5 pb-6 pt-16 ${textAl}`}
          style={{
            background: '#ffffff',
            backgroundImage: `linear-gradient(${tint(theme.accentColor, 14)} 1px, transparent 1px), linear-gradient(90deg, ${tint(theme.accentColor, 14)} 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          }}
        >
          <h1 className="text-[22px] font-bold tracking-[0.06em]" style={{ color: theme.accentColor }}>{name}</h1>
          {p.socials}
          {p.bio}
          {p.email}
        </div>
      </div>
    );
  } else if (layout === 'label') {
    // 斜角名牌:大照片,名稱放在斜切色塊上
    const p = info({ align: al });
    header = (
      <div className="w-full">
        <div className="relative -mx-5 pb-1">
          {bigPhoto('') ?? <div className="h-40" style={{ background: theme.bandColor }} />}
          <div
            className="absolute bottom-5 left-0 py-2 pl-5 pr-10 text-xl font-bold tracking-[0.06em] text-white"
            style={{ background: theme.accentColor, clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)' }}
          >
            {name}
          </div>
        </div>
        <div className={`flex flex-col ${items}`}>
          {p.tags}
          {p.socials}
          {p.bio}
          {p.email}
        </div>
      </div>
    );
  } else if (layout === 'arch') {
    // 弧形照片:照片底部是弧線
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col ${items}`}>
        {shape === 'circle' ? (
          <div className="-mx-5 self-stretch">{bigPhoto('')}</div>
        ) : (
          <div className="-mx-5 self-stretch" style={{ clipPath: 'ellipse(85% 100% at 50% 0)' }}>
            {photoImg(`${aspect} w-full`) ?? <div className="h-48" style={{ background: theme.bandColor }} />}
          </div>
        )}
        <h1 className={`mt-5 text-[24px] font-bold tracking-[0.06em] ${textAl}`} style={{ color: theme.accentColor }}>{name}</h1>
        {p.tags}
        {p.bio}
        {p.email}
        {p.socials}
      </div>
    );
  } else if (layout === 'floating') {
    // 浮動名片:白色資料卡,頭像壓在右上角(置中時壓在正上方)
    const p = info({ align: al, text: ink, muted: inkMuted, tagStyle: theme.tagStyle === 'solid' ? 'solid' : 'outline' });
    header = (
      <div className="w-full">
        {coverBand('h-32')}
        <div className="relative -mt-20">
          <div className={`flex flex-col rounded-3xl bg-white px-5 pb-5 ${items} ${textAl} ${showAvatar && !isLeft ? 'pt-14' : 'pt-5'}`} style={{ boxShadow: paperShadow, color: ink }}>
            <h1 className={`text-[22px] font-bold tracking-[0.04em] ${showAvatar && isLeft ? 'pr-24' : ''}`}>{name}</h1>
            {p.tags}
            {p.bio}
            {p.email}
            {p.socials}
          </div>
          {showAvatar
            ? avatar(`absolute ${isLeft ? '-top-6 right-4' : '-top-10 left-1/2 -translate-x-1/2'} ${avatarBox('w-20')}`, { border: '4px solid #ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' })
            : null}
        </div>
      </div>
    );
  } else if (layout === 'side') {
    // 半版照片:左半照片,右半資料
    const p = info({ align: al });
    header = (
      <div className="-mx-5 flex self-stretch" style={{ minHeight: 300 }}>
        {photo ? (
          shape === 'circle' ? (
            <div className="flex w-1/2 shrink-0 items-center justify-center p-3">{photoImg('aspect-square w-full rounded-full', ringStyle)}</div>
          ) : (
            photoImg('w-1/2 shrink-0')
          )
        ) : null}
        <div className={`flex flex-col justify-between py-6 ${items} ${textAl} ${photo ? 'w-1/2 px-4' : 'w-full px-5'}`}>
          <h1 className="text-[22px] font-semibold leading-7 tracking-[0.04em]">{name}</h1>
          <div className={`flex flex-col ${items}`}>
            {p.tags}
            {p.bio}
            {p.email}
            {p.socials}
          </div>
        </div>
      </div>
    );
  } else if (layout === 'blob') {
    // 花邊相框:圓形為不規則花邊,方形 / 直式為圓角相框
    const p = info({ align: al });
    const frameRadius = shape === 'circle' ? '42% 58% 63% 37% / 41% 44% 56% 59%' : '28px';
    const ringRadius = shape === 'circle' ? '58% 42% 52% 48% / 46% 58% 42% 54%' : '34px';
    const size = shape === 'portrait' ? 'w-40 aspect-[4/5]' : 'w-44 aspect-square';
    header = (
      <div className={`flex w-full flex-col pt-10 ${items}`}>
        <h1 className={`text-[22px] font-bold tracking-[0.08em] ${textAl}`} style={{ color: theme.accentColor }}>{name}</h1>
        <div className="relative mx-3 mt-5">
          <div className="absolute -inset-3 border-2" style={{ borderColor: tint(theme.textColor, 45), borderRadius: ringRadius }} />
          {photoImg(`relative ${size}`, { borderRadius: frameRadius, border: '6px solid #ffffff' }) ?? <div className={`${size} bg-white/80`} style={{ borderRadius: frameRadius }} />}
        </div>
        <div className="mt-4">{p.email}</div>
        {p.socials}
        {p.tags}
        {p.bio}
      </div>
    );
  } else if (layout === 'sticker') {
    // 側欄標籤:社群直排在左,名稱放在色塊標籤
    const p = info({ align: al, vertical: true });
    const frameRadius = shape === 'circle' ? '48% 52% 45% 55% / 52% 46% 54% 48%' : '28px';
    header = (
      <div className={`flex w-full flex-col pt-8 ${items}`}>
        <div className="relative w-full">
          <span className="absolute -left-2 top-2 h-16 w-16 rounded-full" style={{ background: tint(theme.accentColor, 30) }} />
          <span className="absolute bottom-6 right-2 h-12 w-12 rounded-full" style={{ background: tint(theme.accentColor, 25) }} />
          <div className="relative ml-10 mr-4">
            {photoImg(`${aspect} w-full`, { borderRadius: frameRadius }) ?? <div className={`${aspect} w-full bg-white/80`} style={{ borderRadius: frameRadius }} />}
          </div>
          {p.socials ? <div className="absolute bottom-4 left-0">{p.socials}</div> : null}
        </div>
        <div className="relative -mt-4 inline-block px-3 py-1.5 text-xl font-bold tracking-[0.06em] text-white" style={{ background: theme.accentColor }}>{name}</div>
        {p.email}
        {p.tags}
        {p.bio}
      </div>
    );
  } else if (layout === 'news') {
    // 報紙:報頭、#標籤條、文字欄+照片、鋸齒邊
    const zig = 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%';
    const hasBio = card.show_bio && card.bio;
    header = (
      <div className="w-full pt-8">
        <div className={`bg-white px-4 pb-6 pt-3 ${textAl}`} style={{ color: theme.accentColor, WebkitMask: zig, mask: zig }}>
          <p className="text-[11px] font-black italic tracking-wide">DAILY NEWS!</p>
          <h1 className="text-[30px] font-black leading-tight tracking-[0.02em]">{name}</h1>
          {card.show_tags && card.tags.length > 0 ? (
            <div className={`mt-2 flex gap-3 overflow-hidden whitespace-nowrap px-2 py-1 text-[11px] font-bold text-white ${isLeft ? '' : 'justify-center'}`} style={{ background: theme.accentColor }}>
              {card.tags.map((t) => <span key={t}>#{t}</span>)}
            </div>
          ) : null}
          <div className="mt-1 h-0.5 w-full" style={{ background: theme.accentColor }} />
          <div className={`mt-3 flex gap-3 ${isLeft ? '' : 'flex-col items-center'}`}>
            {hasBio ? <p className={`min-w-0 flex-1 whitespace-pre-line text-sm font-bold leading-6 ${textAl}`}>{card.bio}</p> : null}
            {photoImg(`${aspect} ${shape === 'circle' ? 'rounded-full' : ''} ${hasBio && isLeft ? 'w-[46%]' : 'w-[70%]'} shrink-0`)}
          </div>
          <div className="mt-3 border-t-2 pt-2" style={{ borderColor: theme.accentColor }}>
            {socials.length > 0 ? (
              <div className={`flex gap-2 ${isLeft ? '' : 'justify-center'}`}>
                {socials.map((sc, i) => (
                  <a key={`${sc.type}-${i}`} href={socialUrl(sc)} target="_blank" rel="noreferrer" aria-label={sc.type} className="transition hover:opacity-70"><SocialIcon type={sc.type} size={18} /></a>
                ))}
              </div>
            ) : null}
            {card.show_email && card.email ? <a href={`mailto:${card.email}`} className="mt-1 block text-xs">{card.email}</a> : null}
          </div>
        </div>
      </div>
    );
  } else if (layout === 'framed') {
    // 相框:名稱在上,照片加白框
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col pt-10 ${items}`}>
        <h1 className={`text-[22px] font-bold tracking-[0.06em] ${textAl}`}>{name}</h1>
        {photoImg(`mt-4 ${aspect} w-[58%] ${shape === 'circle' ? 'rounded-full' : ''}`, { ...ringStyle, borderRadius: shape === 'circle' ? undefined : 4 })}
        {p.email}
        {p.tags}
        {p.socials}
        {p.bio}
      </div>
    );
  } else if (layout === 'boxed') {
    // 卡片:所有資料包在一張卡片裡
    const p = info({ align: al, text: theme.accentColor, muted: inkMuted });
    header = (
      <div className={`mt-8 flex w-full flex-col rounded-2xl bg-white p-4 ${items} ${textAl}`} style={{ boxShadow: paperShadow }}>
        <h1 className="text-[22px] font-bold tracking-[0.06em]" style={{ color: theme.accentColor }}>{name}</h1>
        {shape === 'circle' ? photoImg('mt-3 aspect-square w-40 rounded-full') : photoImg(`mt-3 ${aspect} w-full rounded-xl`)}
        {p.bio}
        {p.socials}
        {p.tags}
        {p.email}
      </div>
    );
  } else if (layout === 'search') {
    // 搜尋列:名稱放在搜尋框裡
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col pt-8 ${items}`}>
        <div className="flex items-center gap-2 self-stretch rounded-full px-4 py-2.5" style={{ background: tint(theme.accentColor, 16) }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
          <h1 className="truncate text-base font-bold tracking-[0.04em]">{name}</h1>
        </div>
        <div className="-mx-5 mt-4 self-stretch">{bigPhoto('')}</div>
        <div className="mt-3 font-bold italic">{p.email}</div>
        {p.bio}
        {p.tags}
        {p.socials}
      </div>
    );
  } else if (layout === 'card') {
    // 名片卡:頂部封面/色塊+浮起的資料卡
    const p = info({ align: al });
    header = (
      <>
        {coverBand('h-40')}
        <div
          className={`relative -mt-20 flex w-full flex-col rounded-3xl px-5 pb-6 pt-5 ${items} ${textAl}`}
          style={{ background: dark ? `color-mix(in srgb, ${theme.bgColor} 90%, white)` : '#ffffff', border: `1px solid ${tint(theme.textColor, 8)}`, boxShadow: '0 12px 32px rgba(0,0,0,0.1)' }}
        >
          {showAvatar ? avatar(`-mt-14 ${avatarBox('w-20')}`, { border: `3px solid ${dark ? theme.bgColor : '#ffffff'}` }) : null}
          <h1 className={`${showAvatar ? 'mt-3' : 'mt-1'} text-[21px] font-semibold tracking-[0.04em]`}>{name}</h1>
          {p.tags}
          {p.bio}
          {p.email}
          {p.socials}
        </div>
      </>
    );
  } else if (layout === 'split') {
    // 左右並排:大頭照在左、名稱與標籤在右(置中時上下排列)
    const cover = Boolean(theme.coverImage || theme.headerBand);
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col ${items}`}>
        {cover ? coverBand('aspect-[3/1]') : null}
        <div className={`${isLeft ? 'flex items-center gap-4 self-stretch' : 'flex flex-col items-center gap-3 text-center'} ${cover ? '' : 'pt-12'}`}>
          {showAvatar ? avatar(`${avatarBox('w-24')} ${cover ? '-mt-10' : ''}`, cover ? { border: `3px solid ${theme.bgColor}` } : undefined) : null}
          <div className={`min-w-0 flex-1 ${!showAvatar && cover ? 'pt-5' : ''}`}>
            <h1 className="text-[22px] font-semibold leading-7 tracking-[0.03em]">{name}</h1>
            {p.tags ? <div className="-mt-1">{p.tags}</div> : null}
          </div>
        </div>
        {p.bio}
        {p.email}
        {p.socials}
      </div>
    );
  } else if (layout === 'magazine') {
    // 雜誌大圖:大字名稱+大照片
    const image = theme.coverImage || (showAvatar ? card.avatar_url : '');
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col pt-12 ${items}`}>
        <h1 className={`text-[34px] font-bold leading-[1.12] tracking-[0.02em] ${textAl}`}>{name}</h1>
        {p.tags}
        {image ? (
          <div className={`mt-5 ${aspect} ${shape === 'circle' ? 'w-[80%] rounded-full' : 'w-full'} overflow-hidden`} style={shape === 'circle' ? undefined : { borderRadius: Math.min(radius, 24) }}>
            <img src={image} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        {p.bio}
        {p.email}
        {p.socials}
      </div>
    );
  } else if (layout === 'minimal') {
    // 極簡:小頭像與名稱同一行(置中時上下排列),細線分隔
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col pt-14 ${items}`}>
        {theme.coverImage ? (
          <div className="mb-6 aspect-[3/1] w-full overflow-hidden" style={{ borderRadius: Math.min(radius, 18) }}>
            <img src={theme.coverImage} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className={isLeft ? 'flex items-center gap-3 self-stretch' : 'flex flex-col items-center gap-2 text-center'}>
          {showAvatar ? avatar(avatarBox('w-14')) : null}
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
    // 經典置中
    const cover = Boolean(theme.coverImage || theme.headerBand);
    const p = info({ align: al });
    header = (
      <div className={`flex w-full flex-col ${items} ${cover ? '' : 'pt-12'}`}>
        {cover ? coverBand('aspect-[5/2]') : null}
        {showAvatar ? avatar(`relative ${avatarBox(shape === 'portrait' ? 'w-28' : 'w-24')} ${cover ? '-mt-12' : ''}`, cover ? { border: `3px solid ${theme.bgColor}` } : undefined) : null}
        <h1 className={`${showAvatar || !cover ? 'mt-4' : 'mt-6'} text-[22px] font-semibold tracking-[0.04em] ${textAl}`}>{name}</h1>
        {p.tags}
        {p.socials}
        {p.bio}
        {p.email}
      </div>
    );
  }

  // 連結樣式:置中按鈕 / 靠左按鈕 / 清單 / 圖卡 / 左側色條 / 底線色塊 / 漸層按鈕
  function renderLink(b: ProfileCardBlock) {
    const common = { href: normalizeUrl(b.url), target: '_blank', rel: 'noreferrer', onClick: () => track(b.id) };
    const thumbRadius = Math.max(Math.min(radius, 16) - 6, 2);
    const icon = isIconImage(b.image);
    // 縮圖:內建圖示(跟著文字顏色)/ 透明 PNG(完整顯示不加白底)/ 一般照片(裁切填滿)
    const thumbFor = (size: string, r: number) =>
      !b.image ? null : icon ? (
        <span className={`flex ${size} shrink-0 items-center justify-center`}><LinkIcon value={b.image} size={22} /></span>
      ) : isPng(b.image) ? (
        <img src={b.image} alt="" className={`${size} shrink-0 object-contain`} style={{ borderRadius: r }} />
      ) : (
        <img src={b.image} alt="" className={`${size} shrink-0 bg-white object-cover`} style={{ borderRadius: r }} />
      );
    const thumb = thumbFor('h-10 w-10', thumbRadius);
    const row = 'flex min-h-[52px] items-center gap-3 px-4 py-2.5 text-left text-sm font-medium leading-5 transition';
    if (theme.linkStyle === 'left') {
      return (
        <a key={b.id} {...common} className={`${row} hover:opacity-85`} style={buttonStyle}>
          {thumb}
          <span className="min-w-0 flex-1 pl-1">{b.title}</span>
          {arrow}
        </a>
      );
    }
    if (theme.linkStyle === 'bar') {
      return (
        <a
          key={b.id}
          {...common}
          className={`${row} hover:opacity-85`}
          style={{ borderLeft: `5px solid ${theme.buttonColor}`, background: `linear-gradient(90deg, ${tint(theme.buttonColor, dark ? 35 : 30)}, ${tint(theme.buttonColor, 5)})`, color: theme.buttonTextColor, borderRadius: 2 }}
        >
          {thumb}
          <span className="min-w-0 flex-1">{b.title}</span>
        </a>
      );
    }
    if (theme.linkStyle === 'underline') {
      return (
        <a key={b.id} {...common} className={`${row} hover:opacity-80`} style={{ borderBottom: `2px solid ${theme.buttonColor}`, background: tint(theme.buttonColor, 14), color: theme.buttonTextColor }}>
          {thumb}
          <span className="min-w-0 flex-1">{b.title}</span>
          {arrow}
        </a>
      );
    }
    if (theme.linkStyle === 'gradient') {
      return (
        <a
          key={b.id}
          {...common}
          className={`${row} hover:opacity-90`}
          style={{ borderRadius: radius, background: `linear-gradient(90deg, ${theme.buttonColor}, color-mix(in srgb, ${theme.buttonColor} 45%, ${dark ? '#888888' : '#ffffff'}))`, color: theme.buttonTextColor, boxShadow: theme.buttonShadow ? '0 6px 18px rgba(0,0,0,0.08)' : undefined }}
        >
          {thumb}
          <span className="min-w-0 flex-1">{b.title}</span>
          {arrow}
        </a>
      );
    }
    if (theme.linkStyle === 'list') {
      return (
        <a key={b.id} {...common} className="flex min-h-[56px] items-center gap-3 py-2.5 text-left text-sm font-medium leading-5 transition hover:opacity-70" style={{ borderBottom: `1px solid ${tint(theme.textColor, 15)}`, color: theme.textColor }}>
          {thumbFor('h-11 w-11', 8)}
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
            {icon ? thumbFor('h-6 w-6', 0) : null}
            <span className="min-w-0 flex-1">{b.title}</span>
            {b.image && !icon ? null : arrow}
          </span>
          {b.image && !icon ? (
            <span className="block px-3 pb-3">
              <img src={b.image} alt="" className={`aspect-[16/9] w-full ${isPng(b.image) ? 'object-contain' : 'bg-white object-cover'}`} style={{ borderRadius: Math.max(Math.min(radius, 18) - 6, 4) }} />
            </span>
          ) : null}
        </a>
      );
    }
    return (
      <a key={b.id} {...common} className="relative flex min-h-[56px] items-center justify-center px-14 py-3 text-center text-sm font-medium leading-5 transition hover:opacity-85" style={buttonStyle}>
        {b.image ? <span className="absolute left-2 top-1/2 -translate-y-1/2">{thumbFor('h-10 w-10', Math.max(radius - 6, 2))}</span> : null}
        {b.title}
      </a>
    );
  }

  return (
    <div className={fullScreen ? 'min-h-screen' : 'min-h-full'} style={pageStyle}>
      <div className={`mx-auto flex max-w-[440px] flex-col px-5 pb-10 ${left ? 'items-start' : 'items-center'}`}>
        {header}
        {theme.divider === 'wave' ? (
          <svg viewBox="0 0 200 10" preserveAspectRatio="none" className="mt-6 h-2.5 w-full" aria-hidden="true">
            <path d="M0 5 Q 5 0 10 5 T 20 5 T 30 5 T 40 5 T 50 5 T 60 5 T 70 5 T 80 5 T 90 5 T 100 5 T 110 5 T 120 5 T 130 5 T 140 5 T 150 5 T 160 5 T 170 5 T 180 5 T 190 5 T 200 5" fill="none" stroke={tint(theme.textColor, 55)} strokeWidth="1.4" />
          </svg>
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
