import sharp from 'sharp';

// 網頁用圖片：最長邊 1600px，維持 JPG／PNG（LINE 訊息只收 JPG／PNG，不轉 WebP）。
// 不透明的 PNG 改存 JPG；有透明背景的 PNG 用調色盤壓縮。GIF（可能是動圖）原樣保留。
export const WEB_IMAGE_MAX = 1600;

export type WebImage = { bytes: Buffer; mime: string; ext: string };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function shrinkForWeb(input: Buffer, mime: string): Promise<WebImage> {
  const original = { bytes: input, mime, ext: EXT[mime] ?? 'jpg' };
  if (mime === 'image/gif' || !EXT[mime]) return original;
  const image = sharp(input, { limitInputPixels: 24_000_000, failOn: 'warning' });
  const meta = await image.metadata();
  const resized = image.rotate().resize(WEB_IMAGE_MAX, WEB_IMAGE_MAX, { fit: 'inside', withoutEnlargement: true });
  let out: WebImage;
  if (mime === 'image/png') {
    const opaque = !meta.hasAlpha || (await sharp(input).stats()).isOpaque;
    out = opaque
      ? { bytes: await resized.flatten({ background: '#ffffff' }).jpeg({ quality: 85, mozjpeg: true }).timeout({ seconds: 15 }).toBuffer(), mime: 'image/jpeg', ext: 'jpg' }
      : { bytes: await resized.png({ palette: true, quality: 90, compressionLevel: 9, effort: 8 }).timeout({ seconds: 15 }).toBuffer(), mime: 'image/png', ext: 'png' };
  } else if (mime === 'image/webp') {
    out = { bytes: await resized.webp({ quality: 85 }).timeout({ seconds: 15 }).toBuffer(), mime, ext: 'webp' };
  } else {
    out = { bytes: await resized.jpeg({ quality: 85, mozjpeg: true }).timeout({ seconds: 15 }).toBuffer(), mime: 'image/jpeg', ext: 'jpg' };
  }
  const shrunk = (meta.width ?? 0) > WEB_IMAGE_MAX || (meta.height ?? 0) > WEB_IMAGE_MAX;
  return out.bytes.length < input.length || shrunk ? out : original;
}
