import { CalendarCheck } from 'lucide-react';
import type { CSSProperties } from 'react';
import { isDarkColor, type CardTheme } from '@/lib/profile-card';
import { resolveBookingButton } from '@/lib/profile-booking-button';

export default function ProfileBookingButton({ theme, href, preview = false }: { theme: CardTheme; href: string; preview?: boolean }) {
  const config = resolveBookingButton(theme.bookingButton);
  const color = config.color || (config.style === 'theme' ? theme.buttonColor : theme.accentColor);
  const foreground = config.textColor || (config.style === 'theme' ? theme.buttonTextColor : isDarkColor(color) ? '#ffffff' : '#1f1b19');
  const radius = config.shape === 'inherit'
    ? theme.buttonShape === 'pill' ? 9999 : theme.buttonShape === 'rounded' ? 16 : 2
    : config.shape === 'pill' ? 9999 : config.shape === 'rounded' ? 12 : 0;
  const outline = config.style === 'outline' || (config.style === 'theme' && theme.buttonFill === 'outline');
  const soft = config.style === 'soft';
  const style: CSSProperties = {
    borderRadius: radius,
    background: outline ? 'transparent' : soft ? `color-mix(in srgb, ${color} 14%, transparent)` : color,
    color: config.textColor || (config.style === 'theme' ? theme.buttonTextColor : outline || soft ? color : foreground),
    border: `1.5px solid ${outline ? color : 'transparent'}`,
    boxShadow: config.shadow ? '0 2px 8px rgba(0,0,0,0.1)' : undefined,
  };
  return (
    <a href={href} data-booking-button className="flex min-h-14 w-full items-center justify-center gap-2 px-4 py-3.5 text-center text-[15px] font-semibold leading-6 transition hover:opacity-90" style={style} onClick={preview ? (event) => event.preventDefault() : undefined}>
      {config.showIcon ? <CalendarCheck size={18} className="shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{config.label}</span>
    </a>
  );
}
