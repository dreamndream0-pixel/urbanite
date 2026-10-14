import { ImageResponse } from 'next/og';
import { LINE_ICONS } from '@/lib/line-icons';

// GET /api/line/icon/[name]?c=hex — LINE 卡片用圖示(SVG 線條圖示轉成 96×96 透明 PNG)
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const shapes = LINE_ICONS[name];
  if (!shapes) return new Response('Not found', { status: 404 });
  const raw = new URL(request.url).searchParams.get('c') ?? '333333';
  const color = `#${/^[0-9a-f]{6}$/i.test(raw) ? raw : '333333'}`;
  const image = new ImageResponse(
    (
      <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {shapes.map((s, i) =>
            s.d ? <path key={i} d={s.d} />
            : s.circle ? <circle key={i} cx={s.circle[0]} cy={s.circle[1]} r={s.circle[2]} />
            : s.rect ? <rect key={i} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} rx={s.rect[4]} />
            : null,
          )}
        </svg>
      </div>
    ),
    { width: 96, height: 96 },
  );
  image.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return image;
}
