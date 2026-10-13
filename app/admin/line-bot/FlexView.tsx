'use client';

import type { CSSProperties, ReactNode } from 'react';

// LINE Flex 訊息的網頁預覽(後台用):支援模板庫用到的 bubble / carousel、box、text、image、separator。
// 尺寸依 LINE 規格等比例縮小,接近手機上看到的樣子。
type Node = Record<string, unknown> & { type?: string };

const SIZE: Record<string, number> = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, '3xl': 35, '4xl': 48, '5xl': 74 };
const SPACE: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const RADIUS: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const BUBBLE_WIDTH: Record<string, number> = { nano: 120, micro: 160, kilo: 260, mega: 300, giga: 386 };

const px = (v: unknown, table: Record<string, number> = SPACE): number | string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v);
  if (s in table) return table[s];
  if (/^-?\d+(\.\d+)?px$/.test(s)) return Number(s.slice(0, -2));
  if (/%$/.test(s)) return s;
  return undefined;
};
// LINE 與 CSS 都用 #RRGGBB / #RRGGBBAA
const color = (c: unknown) => (typeof c === 'string' ? c : undefined);

function boxStyle(n: Node, parentLayout: string): CSSProperties {
  const layout = String(n.layout ?? 'vertical');
  const bg = n.background as { type?: string; angle?: string; startColor?: string; endColor?: string } | undefined;
  const s: CSSProperties = {
    display: 'flex',
    flexDirection: layout === 'vertical' ? 'column' : 'row',
    alignItems: layout === 'baseline' ? 'baseline' : (n.alignItems === 'center' ? 'center' : n.alignItems === 'flex-end' ? 'flex-end' : undefined),
    justifyContent: n.justifyContent === 'center' ? 'center' : n.justifyContent === 'flex-end' ? 'flex-end' : n.justifyContent === 'space-between' ? 'space-between' : undefined,
    backgroundColor: color(n.backgroundColor),
    backgroundImage: bg?.type === 'linearGradient' ? `linear-gradient(${bg.angle ?? '0deg'}, ${color(bg.startColor)}, ${color(bg.endColor)})` : undefined,
    borderRadius: px(n.cornerRadius, RADIUS),
    border: n.borderWidth ? `${px(n.borderWidth, { light: 0.5, normal: 1, medium: 2, 'semi-bold': 3, bold: 4 }) ?? 1}px solid ${color(n.borderColor) ?? '#000'}` : undefined,
    padding: px(n.paddingAll),
    paddingTop: px(n.paddingTop),
    paddingBottom: px(n.paddingBottom),
    paddingLeft: px(n.paddingStart),
    paddingRight: px(n.paddingEnd),
    gap: px(n.spacing),
    width: px(n.width),
    height: px(n.height),
    minWidth: 0,
    overflow: n.cornerRadius ? 'hidden' : undefined,
    cursor: n.action ? 'pointer' : undefined,
    boxSizing: 'border-box',
  };
  Object.assign(s, flexItem(n, parentLayout));
  if (n.position === 'absolute') Object.assign(s, { position: 'absolute', top: px(n.offsetTop), left: px(n.offsetStart), right: px(n.offsetEnd), bottom: px(n.offsetBottom) });
  return s;
}

function flexItem(n: Node, parentLayout: string): CSSProperties {
  const flex = n.flex;
  const margin = px(n.margin);
  const s: CSSProperties = {};
  if (parentLayout === 'vertical') {
    if (typeof flex === 'number' && flex > 0 && n.height === undefined) s.flex = `${flex} 0 auto`;
    if (margin !== undefined) s.marginTop = margin;
  } else {
    if (typeof flex === 'number') s.flex = flex === 0 ? '0 0 auto' : `${flex} 1 0`;
    else if (n.width === undefined) s.flex = '1 1 0';
    if (margin !== undefined) s.marginLeft = margin;
  }
  return s;
}

function Render({ n, parent }: { n: Node; parent: string }): ReactNode {
  if (n.type === 'box') {
    const layout = String(n.layout ?? 'vertical');
    return (
      <div style={{ ...boxStyle(n, parent), position: n.position === 'absolute' ? 'absolute' : 'relative' }}>
        {((n.contents as Node[]) ?? []).map((c, i) => <Render key={i} n={c} parent={layout} />)}
      </div>
    );
  }
  if (n.type === 'text') {
    const size = px(n.size, SIZE) ?? 14;
    return (
      <div
        style={{
          ...flexItem(n, parent),
          fontSize: size,
          lineHeight: 1.35,
          fontWeight: n.weight === 'bold' ? 700 : 400,
          color: color(n.color) ?? '#111',
          textAlign: n.align === 'center' ? 'center' : n.align === 'end' ? 'right' : 'left',
          textDecoration: n.decoration === 'line-through' ? 'line-through' : undefined,
          whiteSpace: n.wrap ? 'pre-wrap' : 'nowrap',
          overflow: 'hidden',
          textOverflow: n.wrap ? undefined : 'ellipsis',
          alignSelf: n.gravity === 'center' ? 'center' : undefined,
          minWidth: 0,
          display: n.maxLines ? '-webkit-box' : undefined,
          WebkitLineClamp: n.maxLines ? Number(n.maxLines) : undefined,
          WebkitBoxOrient: n.maxLines ? 'vertical' : undefined,
        }}
      >
        {String(n.text ?? '')}
      </div>
    );
  }
  if (n.type === 'image') {
    const ratio = String(n.aspectRatio ?? '1:1').split(':').map(Number);
    const url = String(n.url ?? '');
    return (
      <div style={{ ...flexItem(n, parent), width: '100%', aspectRatio: `${ratio[0]} / ${ratio[1]}`, background: '#e9e4dc', overflow: 'hidden' }}>
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: n.aspectMode === 'fit' ? 'contain' : 'cover', display: 'block' }} /> : null}
      </div>
    );
  }
  if (n.type === 'separator') return <div style={{ ...flexItem(n, parent), height: 1, minHeight: 1, background: color(n.color) ?? '#ddd', flex: '0 0 1px' }} />;
  if (n.type === 'button') {
    const action = n.action as { label?: string } | undefined;
    return <div style={{ ...flexItem(n, parent), padding: 8, borderRadius: 6, textAlign: 'center', fontSize: 14, background: n.style === 'primary' ? color(n.color) ?? '#17c950' : 'transparent', color: n.style === 'primary' ? '#fff' : color(n.color) ?? '#42659a' }}>{action?.label}</div>;
  }
  return null;
}

function Bubble({ b, scale }: { b: Node; scale: number }) {
  const width = BUBBLE_WIDTH[String(b.size ?? 'mega')] ?? 300;
  const part = (key: 'header' | 'hero' | 'body' | 'footer') => {
    const n = b[key] as Node | undefined;
    return n ? <Render n={n} parent="vertical" /> : null;
  };
  return (
    <div style={{ width: width * scale, flex: '0 0 auto' }}>
      <div style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left', borderRadius: 16, overflow: 'hidden', background: '#fff', fontFamily: '-apple-system, "PingFang TC", "Noto Sans TC", sans-serif' }} data-flex-bubble>
        {part('header')}
        {part('hero')}
        {part('body')}
        {part('footer')}
      </div>
    </div>
  );
}

// contents:bubble 或 carousel;scale:縮放(後台縮圖用)
export default function FlexView({ contents, scale = 0.75 }: { contents: Record<string, unknown>; scale?: number }) {
  const bubbles = contents.type === 'carousel' ? ((contents.contents as Node[]) ?? []) : [contents as Node];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {bubbles.map((b, i) => <ScaledBubble key={i} b={b} scale={scale} />)}
    </div>
  );
}

// transform 不會改變版面高度,用量測後的高度包起來
function ScaledBubble({ b, scale }: { b: Node; scale: number }) {
  return (
    <div style={{ display: 'grid' }}>
      <div style={{ gridArea: '1 / 1', height: 'fit-content' }} ref={(el) => {
        if (!el) return;
        const inner = el.querySelector('[data-flex-bubble]') as HTMLElement | null;
        if (inner) el.style.height = `${inner.offsetHeight * scale}px`;
      }}>
        <Bubble b={b} scale={scale} />
      </div>
    </div>
  );
}
