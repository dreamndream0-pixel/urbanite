export const PAYMENT_PROOF_BUCKET = 'payment-proofs';
export const PRIVATE_PROOF_PREFIX = 'private:payment-proofs/';

export function paymentProofPath(reference: string, shopId: string, orderId: string): string | null {
  if (!reference.startsWith(PRIVATE_PROOF_PREFIX)) return null;
  const path = reference.slice(PRIVATE_PROOF_PREFIX.length);
  const prefix = `${shopId}/${orderId}/`;
  return path.startsWith(prefix) && /^[a-zA-Z0-9-]+\.(png|jpg|webp|gif)$/.test(path.slice(prefix.length)) ? path : null;
}

export function legacyPaymentProofPath(reference: string, orderId: string, storageUrl: string): string | null {
  try {
    const url = new URL(reference);
    if (url.origin !== new URL(storageUrl).origin || url.search || url.hash) return null;
    const prefix = '/storage/v1/object/public/assets/';
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return path.startsWith(`payment-proofs/${orderId}-`) && /^payment-proofs\/[a-zA-Z0-9-]+\.(png|jpg|webp|gif)$/.test(path) ? path : null;
  } catch { return null; }
}
