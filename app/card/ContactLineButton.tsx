import SocialIcon from '@/app/components/SocialIcon';

// U Pro / U Max:聯繫專員(官方 LINE)
export default function ContactLineButton({ href, className = '', label = '聯繫專員' }: { href: string; className?: string; label?: string }) {
  if (!href) return <span className={`block rounded-full bg-[#f3eee7] py-2 text-center text-xs text-[#8a7f72] ${className}`}>{label}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-1.5 rounded-full bg-[#06C755] py-2 text-xs font-semibold text-white transition hover:bg-[#05b14c] ${className}`}>
      <SocialIcon type="line" size={16} />
      {label}
    </a>
  );
}
