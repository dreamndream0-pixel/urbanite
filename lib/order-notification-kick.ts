// 訂單狀態改變後(資料庫 trigger 已把通知排進佇列),回應送出後立刻處理佇列,不必等排程。
import { after } from 'next/server';
import { processOrderNotificationQueue } from '@/lib/order-notifications';

export function kickOrderNotifications() {
  try {
    after(() => processOrderNotificationQueue().catch((error) => console.error('order notification dispatch failed', error instanceof Error ? error.message : error)));
  } catch {
    // 不在請求範圍內(例如測試)時略過,交給排程處理
  }
}
