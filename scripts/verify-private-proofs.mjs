import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) throw new Error('Missing server configuration');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const anon = createClient(url, anonKey, options);
const bucket = 'payment-proofs';
const path = `security-probe/${randomUUID()}.png`;
const { data: info, error: bucketError } = await admin.storage.getBucket(bucket);
if (bucketError || info.public) throw new Error('Proof bucket is not private');
const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: 'image/png', upsert: false });
if (error) throw new Error('Probe upload failed');
try {
  const privateResult = await anon.storage.from(bucket).download(path);
  const publicResult = await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`);
  await publicResult.body?.cancel();
  const privateDenied = Boolean(privateResult.error);
  const publicDenied = !publicResult.ok;
  console.log(JSON.stringify({ privateBucket: true, anonymousDownloadDenied: privateDenied, publicUrlDenied: publicDenied }));
  if (!privateDenied || !publicDenied) throw new Error('Anonymous proof access detected; apply restrictive storage policy');
} finally {
  const { error: cleanupError } = await admin.storage.from(bucket).remove([path]);
  if (cleanupError) throw new Error('Synthetic probe cleanup failed');
}
