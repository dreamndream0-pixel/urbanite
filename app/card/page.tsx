import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import styles from "./landing.module.css";
import HeroScene from "./HeroScene";
import ProductShowcase from "./ProductShowcase";
import PromoBar from "./PromoBar";
import RefCapture from "./RefCapture";
import CustomerCasePreview from "./CustomerCasePreview";
import FloatingLineSupport from "./FloatingLineSupport";

export const dynamic = "force-dynamic";
const CARD_TITLE = "URBANLINKS｜一個連結，把你的世界串起來";
const CARD_DESCRIPTION = "從個人名片、購物商店到品牌頁面，一個連結，把你的世界串起來。";
// 分享預覽圖只換 /card(URBANLINKS 橫式 logo),官網賣場仍用 layout 的 /api/og
const CARD_SHARE_IMAGE = { url: "/brand/urbanlinks-share.png", width: 1200, height: 630, alt: "URBANLINKS" };
export const metadata: Metadata = {
  title: { absolute: CARD_TITLE },
  description: CARD_DESCRIPTION,
  openGraph: {
    title: CARD_TITLE,
    description: CARD_DESCRIPTION,
    url: "/card",
    siteName: "URBANLINKS",
    type: "website",
    locale: "zh_TW",
    images: [CARD_SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: CARD_TITLE, description: CARD_DESCRIPTION, images: [CARD_SHARE_IMAGE.url] },
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
      <CustomerCasePreview />
      <FloatingLineSupport />

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
