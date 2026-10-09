import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export function publicIpv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function publicUrl(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
    host.endsWith('.') || !host.includes('.') || /\.(localhost|local|internal)$/.test(host) ||
    host.includes(':') || (isIP(host) && !publicIpv4(host))) throw new Error('Unsafe public URL');
  return url;
}

export async function fetchPublic(raw: string, maxBytes = 6_000_000, userAgent = 'Mozilla/5.0 (compatible; UrbaniteLinkPreview/1.0)'): Promise<{ res: Response; url: string }> {
  const signal = AbortSignal.timeout(15_000);
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = publicUrl(current);
    // Use only validated IPv4 addresses, including at connect time. IPv6-only hosts are unsupported.
    const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
      const abort = () => reject(new Error('Public lookup timed out'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      lookup(url.hostname, { all: true, family: 4 }).then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
    if (!addresses.length || addresses.some(a => !publicIpv4(a.address))) throw new Error('Unsafe public address');
    const address = addresses[0].address;
    const result = await new Promise<{ status: number; headers: Headers; bytes: Buffer }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        agent: false, signal,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address, family: 4 }]);
          else callback(null, address, 4);
        },
        headers: { 'User-Agent': userAgent, 'Accept-Encoding': 'identity', Accept: '*/*', 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      }, response => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const status = response.statusCode ?? 502;
        response.on('error', reject);
        if (status >= 300 && status < 400 && headers.has('location')) {
          resolve({ status, headers, bytes: Buffer.alloc(0) });
          response.destroy();
          return;
        }
        if (Number(headers.get('content-length')) > maxBytes ||
          (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity')) {
          reject(new Error('Unsupported or oversized response'));
          response.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) { reject(new Error('Response too large')); response.destroy(); }
          else chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, headers, bytes: Buffer.concat(chunks) }));
      });
      request.on('error', reject);
      request.end();
    });
    const next = result.status >= 300 && result.status < 400 ? result.headers.get('location') : null;
    if (next) { current = new URL(next, url).href; continue; }
    return { url: url.href, res: new Response([204, 205, 304].includes(result.status) ? null : new Uint8Array(result.bytes), { status: result.status, headers: result.headers }) };
  }
  throw new Error('Too many redirects');
}
