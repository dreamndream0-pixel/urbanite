import type { Metadata } from 'next';
import { Suspense } from 'react';
import OrderLookupClient from './OrderLookupClient';

export const metadata: Metadata = { title: '訪客查詢訂單', robots: { index: false } };

// 訪客查詢訂單:輸入訂單編號 + 下單時的手機或 Email
export default function OrderLookupPage() {
  return <Suspense><OrderLookupClient /></Suspense>;
}
