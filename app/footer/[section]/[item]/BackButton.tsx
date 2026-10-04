'use client';

import { useRouter } from 'next/navigation';

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push('/');
      }}
      className="text-sm font-semibold text-[var(--c-text2)] hover:text-[var(--c-text)]"
    >
      ← 回上一頁
    </button>
  );
}
