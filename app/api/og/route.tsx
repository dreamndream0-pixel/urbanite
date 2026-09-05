import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// 分享卡(og:image):固定 1200×630,把完整商店 logo 置中留白,避免寬長型 logo 被各 App 裁切。
export async function GET() {
  let logo = '';
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from('site_settings').select('logo_url').eq('id', 1).maybeSingle();
    logo = data?.logo_url || '';
  } catch {
    /* 使用文字後備 */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#faf7f2',
          padding: '120px',
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt="Urbanite"
            width={720}
            height={360}
            style={{ width: 720, height: 360, objectFit: 'contain' }}
          />
        ) : (
          <div style={{ fontSize: 140, fontWeight: 800, letterSpacing: '-4px', color: '#1f1b19' }}>
            URBANITE
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
