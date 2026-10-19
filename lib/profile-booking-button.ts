import type { ProfileCardBlock } from './profile-card';

export type BookingButton = {
  visible: boolean;
  after: string;
  label: string;
  style: 'accent' | 'theme' | 'outline' | 'soft';
  shape: 'inherit' | 'pill' | 'rounded' | 'square';
  color: string;
  textColor: string;
  showIcon: boolean;
  shadow: boolean;
};

export const BOOKING_BUTTON_END = '__end__';
export const DEFAULT_BOOKING_BUTTON: BookingButton = {
  visible: true, after: '', label: '線上預約', style: 'accent', shape: 'inherit',
  color: '', textColor: '', showIcon: true, shadow: true,
};

export function resolveBookingButton(value: unknown): BookingButton {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<BookingButton>;
  const color = (s: unknown) => typeof s === 'string' && /^#[\da-f]{6}$/i.test(s) ? s : '';
  return {
    visible: typeof v.visible === 'boolean' ? v.visible : true,
    after: typeof v.after === 'string' ? v.after.slice(0, 128) : '',
    label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 80) : DEFAULT_BOOKING_BUTTON.label,
    style: ['accent', 'theme', 'outline', 'soft'].includes(v.style ?? '') ? v.style! : 'accent',
    shape: ['inherit', 'pill', 'rounded', 'square'].includes(v.shape ?? '') ? v.shape! : 'inherit',
    color: color(v.color), textColor: color(v.textColor),
    showIcon: typeof v.showIcon === 'boolean' ? v.showIcon : true,
    shadow: typeof v.shadow === 'boolean' ? v.shadow : true,
  };
}

export function bookingButtonForPlan(value: unknown, customStyle: boolean): BookingButton {
  const resolved = resolveBookingButton(value);
  if (customStyle) return resolved;
  const { visible, after, label, showIcon } = resolved;
  return { ...DEFAULT_BOOKING_BUTTON, visible, after, label, showIcon };
}

// Anchor to a block ID rather than a numeric offset so additions do not move the button.
export function bookingButtonIndex(blocks: ProfileCardBlock[], visible: ProfileCardBlock[], after: string): number {
  if (!after) return 0;
  if (after === BOOKING_BUTTON_END) return visible.length;
  const index = blocks.findIndex((b) => b.id === after);
  if (index < 0) return visible.length;
  const preceding = new Set(blocks.slice(0, index + 1).map((b) => b.id));
  return visible.filter((b) => preceding.has(b.id)).length;
}
