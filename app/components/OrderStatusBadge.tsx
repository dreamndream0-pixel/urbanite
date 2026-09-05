import type { Order } from '@/lib/types';

type Tone = 'amber' | 'green' | 'blue' | 'red' | 'grey';
type IconName = 'clock' | 'truck' | 'store' | 'check' | 'x' | 'undo' | 'box';

const TONE: Record<Tone, string> = {
  amber: 'bg-[#fdf3e7] text-[#9a6a1f]',
  green: 'bg-[#e9f7ee] text-[#1f7a44]',
  blue: 'bg-[#eaf1fb] text-[#2b5fa5]',
  red: 'bg-[#fbe9e7] text-[#c0392b]',
  grey: 'bg-[#f3ede4] text-[#6b6156]',
};

// 由訂單狀態 + 物流狀態 + 付款推導出「顯示狀態」(標籤 / 色調 / 圖示)
export function orderDisplayStatus(order: Pick<Order, 'status' | 'fulfillment_status' | 'paid'>): {
  label: string; tone: Tone; icon: IconName;
} {
  const f = order.fulfillment_status ?? '';
  if (order.status === '取消') return { label: '已取消', tone: 'red', icon: 'x' };
  if (order.status === '退貨' || f === 'RETURNING') return { label: '退貨中', tone: 'red', icon: 'undo' };
  if (f === 'RETURNED') return { label: '已退貨', tone: 'red', icon: 'undo' };
  if (f === 'PICKED_UP') return { label: '已取貨完成', tone: 'green', icon: 'check' };
  if (order.status === '已完成' || f === 'DELIVERED') return { label: '已完成', tone: 'green', icon: 'check' };
  if (f === 'AT_STORE') return { label: '待取貨', tone: 'blue', icon: 'store' };
  if (f === 'IN_TRANSIT') return { label: '配送中', tone: 'blue', icon: 'truck' };
  if (f === 'SHIPPED' || order.status === '已出貨') return { label: '已出貨', tone: 'blue', icon: 'truck' };
  if (order.status === '尚未付款' || !order.paid) return { label: '尚未付款', tone: 'amber', icon: 'clock' };
  return { label: '待出貨', tone: 'green', icon: 'box' };
}

function Icon({ name }: { name: IconName }) {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'clock': return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case 'truck': return (<svg {...p}><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></svg>);
    case 'store': return (<svg {...p}><path d="M4 9l1-4h14l1 4M5 9v10h14V9M4 9h16" /><path d="M9 19v-5h6v5" /></svg>);
    case 'check': return (<svg {...p}><path d="M5 13l4 4L19 7" strokeWidth={2.4} /></svg>);
    case 'x': return (<svg {...p}><path d="M6 6l12 12M18 6L6 18" strokeWidth={2.2} /></svg>);
    case 'undo': return (<svg {...p}><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 0 1 0 10h-3" /></svg>);
    case 'box': default: return (<svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>);
  }
}

// 狀態徽章(圖示 + 顏色)
export function OrderStatusBadge({ order, className = '' }: { order: Pick<Order, 'status' | 'fulfillment_status' | 'paid'>; className?: string }) {
  const s = orderDisplayStatus(order);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${TONE[s.tone]} ${className}`}>
      <Icon name={s.icon} />
      {s.label}
    </span>
  );
}

// 買家已回報匯款但賣家尚未確認收款
export function isPaymentReported(o: Pick<Order, 'paid' | 'status' | 'payment_ref' | 'payment_proof_url' | 'payment_proof_note'>): boolean {
  return !o.paid
    && o.status !== '取消' && o.status !== '退貨'
    && Boolean(o.payment_ref || o.payment_proof_url || o.payment_proof_note);
}

// 是否需要「紅點」提醒。admin:待出貨/通知已付款/待審核取消;customer:尚未付款/待取貨。
export function orderNeedsAttention(
  order: Pick<Order, 'status' | 'fulfillment_status' | 'paid' | 'cancel_status' | 'payment_ref' | 'payment_proof_url' | 'payment_proof_note'>,
  role: 'admin' | 'customer',
): boolean {
  if (order.status === '取消' || order.status === '退貨') return false;
  if (role === 'admin') {
    if (order.cancel_status === 'REQUESTED') return true;
    if (isPaymentReported(order)) return true;
    return order.status === '待出貨';
  }
  if (order.status === '尚未付款' || !order.paid) return order.status !== '已完成';
  return order.fulfillment_status === 'AT_STORE';
}

// 紅色小點
export function AttentionDot({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#e5484d] ring-2 ring-white ${className}`} aria-label="待處理" />
  );
}
