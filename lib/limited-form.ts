export async function limitedFormData(request: Request, maxBytes = 6 * 1024 * 1024): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing form body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('Form too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new Response(new Uint8Array(Buffer.concat(chunks)), {
    headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
  }).formData();
}
