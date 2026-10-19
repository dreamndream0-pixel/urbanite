import { getPublicBusiness, loadSchedule } from './server';

export async function getCardBookingHref(slug: string): Promise<string> {
  const booking = await getPublicBusiness(slug);
  if (!booking) return '';
  const schedule = await loadSchedule(booking.business.id);
  return schedule.services.length && schedule.hours.length ? `/@${booking.card.slug}/book` : '';
}
