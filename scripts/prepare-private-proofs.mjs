import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing server configuration');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = 'payment-proofs';
const { data: buckets, error } = await client.storage.listBuckets();
if (error) throw new Error('Unable to inspect storage configuration');
const existing = buckets.find(item => item.id === bucket);
if (process.argv.includes('--apply')) {
  const options = { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] };
  const result = existing ? await client.storage.updateBucket(bucket, options) : await client.storage.createBucket(bucket, options);
  if (result.error) throw new Error('Unable to configure private proof storage');
}
const { data: configured } = await client.storage.getBucket(bucket);
const { count, error: countError } = await client.from('orders').select('id', { count: 'exact', head: true })
  .like('payment_proof_url', `${url}/storage/v1/object/public/assets/payment-proofs/%`);
console.log(JSON.stringify({ privateBucketReady: configured?.public === false, legacyPublicProofReferences: countError ? 'unavailable' : count }));
