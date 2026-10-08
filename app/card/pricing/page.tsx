import type { Metadata } from 'next';
import Image from 'next/image';
import { getSessionUser } from '@/lib/supabase/server';
import { getCardPromo } from '@/lib/card-promo';
import CardServiceHeader from '../CardServiceHeader';
import PricingPlans from './PricingPlans';
import styles from './pricing.module.css';
import PromoBar from '../PromoBar';
import PricingAccount from './PricingAccount';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: '方案價格 | URBANLINKS' },
  description: '從 U Free 開始，選擇適合你的 URBANLINKS 個人名片與品牌官網方案。',
};

async function getPromoSnapshot() {
  return { promo: await getCardPromo(), now: Date.now() };
}

export default async function PricingPage() {
  const user = await getSessionUser();
  const { promo, now } = await getPromoSnapshot();
  return (
    <main className={styles.page}>
      <PromoBar href={user ? '/mycard' : '/card/register'} />
      <CardServiceHeader loggedIn={Boolean(user)} />
      <section className={styles.hero}>
        <picture>
          <source media="(max-width:600px)" srcSet="/card/pricing-studio.webp" />
          <Image src="/card/pricing-studio-wide.webp" alt="石材展示台上的個人名片手機頁面" fill priority sizes="100vw" />
        </picture>
        <div className={styles.heroCopy}>
          <p>URBANLINKS</p>
          <h1>一個連結，<br />把你的世界串起來</h1>
          <p>簡單建立你的個人頁，<br />讓更多人看見你。</p>
          <a href="#plans">找到你的方案 ↓</a>
        </div>
      </section>
      <PricingPlans promo={promo} initialNow={now} loggedIn={Boolean(user)} />
      <PricingAccount />
    </main>
  );
}
