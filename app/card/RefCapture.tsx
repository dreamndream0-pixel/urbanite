'use client';

import { useEffect } from 'react';

// 推薦連結 /card?ref=代稱:記住推薦人 30 天,註冊設定時自動帶入
export default function RefCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')?.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (ref) document.cookie = `card_ref=${ref}; path=/; max-age=${30 * 86400}; samesite=lax`;
  }, []);
  return null;
}
