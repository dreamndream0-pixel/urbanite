'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function DismissibleNotice({ children, label, className = '' }: {
  children: ReactNode; label: string; className?: string;
}) {
  // Deliberately local: reloading or mounting the page again restores the notice.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <div className={`relative ${className}`}>
    {children}
    <button type="button" aria-label={label} title={label} onClick={() => setDismissed(true)}
      className="absolute right-1 top-1 z-50 grid h-10 w-10 cursor-pointer place-items-center rounded-full text-inherit transition hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
      <X size={18} aria-hidden="true" />
    </button>
  </div>;
}
