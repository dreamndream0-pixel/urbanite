import type { CardPromo } from './card-promo';

export function promoActive(p: CardPromo, now = Date.now()) {
  if (!p.enabled || !p.end) return false;
  if (p.start && new Date(p.start).getTime() > now) return false;
  return now < new Date(p.end).getTime();
}
