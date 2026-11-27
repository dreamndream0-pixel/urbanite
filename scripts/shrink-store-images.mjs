// 把已上架的店家圖片縮到網頁大小（最長邊 1600px），同一路徑覆蓋，所以網址和資料庫都不用改。
// JPG 重新壓縮；PNG 維持 PNG（LINE 只收 JPG／PNG，副檔名也不能變）。省不到 20% 的圖不動。
// 用法：node scripts/shrink-store-images.mjs <備份資料夾> [--apply]   （不加 --apply 只試算）
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [backupDir, flag] = process.argv.slice(2);
if (!backupDir) throw new Error('usage: node scripts/shrink-store-images.mjs <backupDir> [--apply]');
const apply = flag === '--apply';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
const auth = { Authorization: `Bearer ${key}`, apikey: key };
const FOLDERS = ['products', 'coupons', 'categories', 'banners', 'campaigns', 'campaign-products', 'storefront'];
const MAX = 1600, MIN_BYTES = 200 * 1024;

async function list(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}/storage/v1/object/list/assets`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset }) });
    const rows = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(rows));
    out.push(...rows.filter((x) => x.id && x.metadata));
    if (rows.length < 1000) return out;
  }
}

async function shrink(buf, mime) {
  const meta = await sharp(buf).metadata();
  const img = sharp(buf, { limitInputPixels: 60_000_000 }).rotate().resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true });
  if (mime === 'image/png') return { bytes: await img.png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer(), meta };
  if (mime === 'image/jpeg') return { bytes: await img.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), meta };
  if (mime === 'image/webp') return { bytes: await img.webp({ quality: 85 }).toBuffer(), meta };
  return null;
}

let before = 0, after = 0, changed = 0, seen = 0;
for (const folder of FOLDERS) {
  for (const o of await list(folder + '/')) {
    const name = `${folder}/${o.name}`, size = o.metadata.size, mime = o.metadata.mimetype;
    seen++;
    if (size < MIN_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) continue;
    const r = await fetch(`${url}/storage/v1/object/assets/${name}`, { headers: auth });
    if (!r.ok) { console.log('skip (download)', name, r.status); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    let res;
    try { res = await shrink(buf, mime); } catch (e) { console.log('skip (decode)', name, e.message); continue; }
    if (!res || res.bytes.length > buf.length * 0.8) continue;
    before += buf.length; after += res.bytes.length; changed++;
    if (apply) {
      const out = path.join(backupDir, name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      const up = await fetch(`${url}/storage/v1/object/assets/${name}`, { method: 'PUT', headers: { ...auth, 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': 'max-age=3600' }, body: res.bytes });
      if (!up.ok) { console.log('upload failed', name, up.status, await up.text()); process.exit(1); }
    }
  }
}
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
console.log(`${apply ? 'applied' : 'dry run'}: ${seen} files checked, ${changed} shrunk, ${mb(before)} -> ${mb(after)} (saves ${mb(before - after)})`);
