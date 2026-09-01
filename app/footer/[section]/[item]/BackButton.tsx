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
      className="text-sm font-semibold text-[#6f675f] hover:text-[#1f1b19]"
    >
      ← 回上一頁
    </button>
  );
}
