// 頁尾社群按鈕的彩色品牌圖示:依按鈕名稱或連結判斷(Instagram、Facebook、LINE、YouTube、TikTok、Threads、X、Email)
// 有上傳自訂圖片時仍以圖片為主;判斷不出品牌就回傳 null,由呼叫端顯示文字
export type SocialBrand = 'instagram' | 'facebook' | 'line' | 'youtube' | 'tiktok' | 'threads' | 'x' | 'email';

export function detectSocialBrand(label = '', url = ''): SocialBrand | null {
  const text = `${label} ${url}`.toLowerCase();
  if (/instagram|instagr\.am|\big\b/.test(text)) return 'instagram';
  if (/facebook|fb\.com|fb\.me|\bfb\b|臉書/.test(text)) return 'facebook';
  if (/\bline\b|lin\.ee|line\.me|官方帳號/.test(text)) return 'line';
  if (/youtube|youtu\.be/.test(text)) return 'youtube';
  if (/tiktok|抖音/.test(text)) return 'tiktok';
  if (/threads/.test(text)) return 'threads';
  if (/twitter|x\.com|\bx\b/.test(text)) return 'x';
  if (/mailto:|e-?mail|信箱|contact|聯絡/.test(text)) return 'email';
  return null;
}

export default function SocialBrandIcon({ brand, className = 'h-full w-full' }: { brand: SocialBrand; className?: string }) {
  const id = `ig-grad-${brand}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {brand === 'instagram' && (
        <>
          <defs>
            <radialGradient id={id} cx="0.3" cy="1.05" r="1.2">
              <stop offset="0" stopColor="#fdd56b" />
              <stop offset="0.25" stopColor="#f9873a" />
              <stop offset="0.5" stopColor="#e1306c" />
              <stop offset="0.8" stopColor="#a23bc0" />
              <stop offset="1" stopColor="#5b51d8" />
            </radialGradient>
          </defs>
          <circle cx="24" cy="24" r="24" fill={`url(#${id})`} />
          <rect x="13" y="13" width="22" height="22" rx="6.5" fill="none" stroke="#fff" strokeWidth="2.6" />
          <circle cx="24" cy="24" r="5.4" fill="none" stroke="#fff" strokeWidth="2.6" />
          <circle cx="30.2" cy="17.8" r="1.6" fill="#fff" />
        </>
      )}
      {brand === 'facebook' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#1877F2" />
          <path fill="#fff" d="M26.6 38V26.2h4l.6-4.6h-4.6v-2.9c0-1.3.4-2.2 2.3-2.2h2.4v-4.1c-.4-.1-1.9-.2-3.5-.2-3.5 0-5.9 2.1-5.9 6v3.4h-4v4.6h4V38h4.7z" />
        </>
      )}
      {brand === 'line' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#06C755" />
          <path fill="#fff" d="M24 11.5c-8 0-14.5 5.2-14.5 11.7 0 5.8 5.2 10.7 12.2 11.6.5.1 1.1.3 1.3.7.1.4.1.9.1 1.3l-.2 1.2c-.1.4-.3 1.4 1.2.8 1.5-.6 8.2-4.8 11.2-8.3 2.1-2.3 3.1-4.6 3.1-7.3 0-6.5-6.5-11.7-14.4-11.7z" />
          <path fill="#06C755" d="M16.2 26.4h-2.9a.8.8 0 0 1-.8-.8v-5.7a.8.8 0 0 1 1.6 0v4.9h2.1a.8.8 0 0 1 0 1.6zm2.8-.8a.8.8 0 0 1-1.6 0v-5.7a.8.8 0 0 1 1.6 0v5.7zm7 0a.8.8 0 0 1-.5.8h-.3a.8.8 0 0 1-.6-.3l-2.9-4v3.5a.8.8 0 0 1-1.6 0v-5.7a.8.8 0 0 1 .5-.8h.3c.2 0 .5.1.6.3l3 4v-3.5a.8.8 0 0 1 1.6 0v5.7zm4.6-3.6a.8.8 0 0 1 0 1.6h-2.1v1.2h2.1a.8.8 0 0 1 0 1.6h-2.9a.8.8 0 0 1-.8-.8v-5.7c0-.4.4-.8.8-.8h2.9a.8.8 0 0 1 0 1.6h-2.1V22h2.1z" />
        </>
      )}
      {brand === 'youtube' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#FF0000" />
          <rect x="11" y="15" width="26" height="18" rx="5" fill="#fff" />
          <path fill="#FF0000" d="M21.5 19.8v8.4l7.2-4.2z" />
        </>
      )}
      {brand === 'tiktok' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#111" />
          <path fill="#25F4EE" d="M27.3 11.5h-3.8v17.2a3.6 3.6 0 1 1-3.6-3.6c.3 0 .7 0 1 .1v-3.9a7.5 7.5 0 1 0 6.4 7.4v-8.8a9.7 9.7 0 0 0 5.6 1.8v-3.8a5.6 5.6 0 0 1-5.6-5.6z" transform="translate(-1 -1)" />
          <path fill="#FE2C55" d="M27.3 11.5h-3.8v17.2a3.6 3.6 0 1 1-3.6-3.6c.3 0 .7 0 1 .1v-3.9a7.5 7.5 0 1 0 6.4 7.4v-8.8a9.7 9.7 0 0 0 5.6 1.8v-3.8a5.6 5.6 0 0 1-5.6-5.6z" transform="translate(1 1)" />
          <path fill="#fff" d="M27.3 11.5h-3.8v17.2a3.6 3.6 0 1 1-3.6-3.6c.3 0 .7 0 1 .1v-3.9a7.5 7.5 0 1 0 6.4 7.4v-8.8a9.7 9.7 0 0 0 5.6 1.8v-3.8a5.6 5.6 0 0 1-5.6-5.6z" />
        </>
      )}
      {brand === 'threads' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#000" />
          <text x="24" y="31.5" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">@</text>
        </>
      )}
      {brand === 'x' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#000" />
          <path fill="#fff" d="M26.2 22.2 34.4 13h-1.9l-7.1 8-5.7-8H13l8.6 12.1L13 35h1.9l7.5-8.5 6 8.5H35l-8.8-12.8zm-2.7 3-.9-1.2-6.9-9.6h3l5.6 7.7.9 1.2 7.2 10.1h-3l-5.9-8.2z" />
        </>
      )}
      {brand === 'email' && (
        <>
          <circle cx="24" cy="24" r="24" fill="#EA4335" />
          <rect x="12.5" y="16" width="23" height="16" rx="2.5" fill="#fff" />
          <path d="m13.5 17.5 10.5 8 10.5-8" fill="none" stroke="#EA4335" strokeWidth="2.2" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
