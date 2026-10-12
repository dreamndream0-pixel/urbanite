// 店家自行寄件(沒串物流):這些方式寄件時不一定有物流單號,出貨不必填單號
export const NO_TRACKING_CARRIERS = ['7-11 交貨便', '全家店到店'];

export function needsTracking(carrier: string) {
  return !NO_TRACKING_CARRIERS.includes(carrier.trim());
}

// 依買家選的配送方式預設寄件方式
export function defaultSelfShipCarrier(shippingMethod: string) {
  if (/全家|family/i.test(shippingMethod)) return '全家店到店';
  if (/7-?11|統一/i.test(shippingMethod)) return '7-11 交貨便';
  return '';
}
