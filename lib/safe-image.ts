import sharp from 'sharp';

export async function sanitizeImage(input: Uint8Array, mime: string): Promise<Buffer> {
  if (!input.length || input.length > 5 * 1024 * 1024) throw new Error('Invalid image size');
  const formats: Record<string, 'png' | 'jpeg' | 'webp' | 'gif'> = {
    'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif',
  };
  const format = formats[mime];
  if (!format) throw new Error('Unsupported image');
  const image = sharp(input, { limitInputPixels: 24_000_000, animated: true, failOn: 'warning' });
  const metadata = await image.metadata();
  if (metadata.format !== format || (metadata.pages ?? 1) > 100) throw new Error('Invalid image content');
  // Re-encoding strips metadata and non-image trailing payloads.
  const output = await image.rotate().toFormat(format).timeout({ seconds: 10 }).toBuffer();
  if (output.length > 5 * 1024 * 1024) throw new Error('Image output too large');
  return output;
}
