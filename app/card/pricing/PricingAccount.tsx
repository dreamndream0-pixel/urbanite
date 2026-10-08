import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlanInfo } from '@/lib/card-access';
import { tierInfo, PERIODS, type CardTier, type CardPeriod } from '@/lib/card-plan';
import styles from './pricing.module.css';

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '';

export default async function PricingAccount() {
  const user = await getSessionUser();
  if (!user) return <section id="account" className={styles.account}>
    <h2>我的方案與付款紀錄</h2>
    <Link href="/card/login?next=%2Fcard%2Fpricing%23account">登入查看我的方案 →</Link>
  </section>;
  const [plan, payments] = await Promise.all([
    getPlanInfo(user),
    createAdminClient().from('card_payments').select('order_no,tier,period,amount,paid_at').eq('user_id', user.id).eq('status', 'paid').order('paid_at', { ascending: false }).limit(10),
  ]);
  return <section id="account" className={styles.account}>
    <h2>我的方案與付款紀錄</h2>
    <div className={styles.accountSummary}>
      <div><p>目前方案</p><strong>{tierInfo(plan.tier).name}</strong>
        <p>{plan.isAdmin ? '管理員帳號' : plan.promo ? `限時免費至 ${date(plan.promoEnd)}` : plan.expiresAt ? `到期日 ${date(plan.expiresAt)}` : '免費方案'}</p>
      </div>
      <Link href="/mycard/upgrade">管理／續約方案 →</Link>
    </div>
    <h3>最近付款紀錄</h3>
    {payments.error ? <p role="status">付款紀錄暫時無法載入，請稍後重新整理。</p> : !payments.data?.length ? <p>尚無付款紀錄</p> : <ul className={styles.payments}>
      {payments.data.map(payment => <li key={payment.order_no}>
        <div><strong>{tierInfo(payment.tier as CardTier).name} · {PERIODS[payment.period as CardPeriod]?.label}</strong><small>{payment.order_no}</small></div>
        <div><strong>NT${payment.amount.toLocaleString('zh-TW')}</strong><small>{date(payment.paid_at)}</small></div>
      </li>)}
    </ul>}
  </section>;
}
