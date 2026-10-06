import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import styles from "./landing.module.css";
import HeroScene from "./HeroScene";
import ProductShowcase from "./ProductShowcase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "URBANLINKS｜一個網址，放進你的全部" },
  description: "從個人名片、購物商店到品牌頁面，用一個網址裝進你的全部。",
};

export default async function CardServicePage() {
  const user = await getSessionUser();
  const startHref = user ? "/mycard" : "/card/register";
  return (
    <main className={styles.page}>
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
