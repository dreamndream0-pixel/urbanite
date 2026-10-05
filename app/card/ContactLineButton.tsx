// U Pro / U Max:聯繫專員(官方 LINE)
export default function ContactLineButton({ href, className = '' }: { href: string; className?: string }) {
  if (!href) return <span className={`block rounded-full bg-[#f3eee7] py-2 text-center text-xs text-[#8a7f72] ${className}`}>聯繫專員</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`flex items-center justify-center gap-1.5 rounded-full bg-[#06C755] py-2 text-xs font-semibold text-white transition hover:bg-[#05b14c] ${className}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3.5C6.8 3.5 2.6 6.9 2.6 11.1c0 3.8 3.4 6.9 7.9 7.5.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.5s5.9-3.5 8-5.9c1.5-1.6 2.2-3.2 2.2-4.9 0-4.2-4.2-7.5-9.3-7.5z" />
      </svg>
      聯繫專員
    </a>
  );
}
