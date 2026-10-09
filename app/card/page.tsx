import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import styles from "./landing.module.css";
import HeroScene from "./HeroScene";
import ProductShowcase from "./ProductShowcase";
import PromoBar from "./PromoBar";
import RefCapture from "./RefCapture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "URBANLINKS｜一個連結，把你的世界串起來" },
  description: "從個人名片、購物商店到品牌頁面，一個連結，把你的世界串起來。",
};

export default async function CardServicePage() {
  const user = await getSessionUser();
  const startHref = user ? "/mycard" : "/card/register";
  return (
    <main className={styles.page}>
      <RefCapture />
      <PromoBar href={startHref} />
      <HeroScene startHref={startHref} loggedIn={Boolean(user)} />

      <ProductShowcase startHref={startHref} />

      <section className={styles.finalCta}>
        <div className={styles.stone} aria-hidden="true">
          <span>••</span>
        </div>
        <Link href={startHref}>
          立即建立你的 URBANLINKS <ArrowRight />
        </Link>
        <p>MORE THAN A LINK</p>
      </section>
    </main>
  );
}
