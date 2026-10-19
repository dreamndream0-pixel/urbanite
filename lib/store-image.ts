export function canOptimizeStoreImage(src: string) {
  if (src.startsWith('/') && !src.startsWith('//') && !src.startsWith('/api/')) return /\.(png|jpe?g|webp|gif|avif)([?#]|$)/i.test(src);
  try {
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const image = new URL(src);
    return image.protocol === 'https:' && image.origin === storage.origin && image.pathname.startsWith('/storage/v1/object/public/assets/');
  } catch { return false; }
}
