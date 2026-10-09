const HOSTS: [RegExp, string][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'pinterest'],
];

export function detectPlatform(raw: string) {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return HOSTS.find(([pattern]) => pattern.test(url.hostname.toLowerCase()))?.[1] ?? '';
  } catch { return ''; }
}
