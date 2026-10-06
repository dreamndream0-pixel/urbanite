import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import styles from "./landing.module.css";
import HeroScene from "./HeroScene";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "URBANLINKS｜一個網址，放進你的全部" },
  description: "從個人名片、購物商店到品牌頁面，用一個網址裝進你的全部。",
};

const products = [
  {
    index: "01",
    name: "LINK",
    label: "個人名片",
    href: "/card/register",
    images: [
      "/showcase/label-sand.webp",
      "/showcase/polaroid-green.webp",
      "/showcase/hero-sun.webp",
    ],
  },
  {
    index: "02",
    name: "SHOP",
    label: "購物商店",
    href: "/card/business",
    images: [
      "/showcase/framed-wood.webp",
      "/showcase/mag-mono.webp",
      "/showcase/side-noir.webp",
    ],
  },
  {
    index: "03",
    name: "BRAND",
    label: "品牌頁面",
    href: "/card/business",
    images: [
      "/showcase/news.webp",
      "/showcase/float-dark.webp",
      "/showcase/arch-aurora.webp",
    ],
  },
];

export default async function CardServicePage() {
  const user = await getSessionUser();
  const startHref = user ? "/mycard" : "/card/register";
  return (
    <main className={styles.page}>
      <HeroScene startHref={startHref} loggedIn={Boolean(user)} />

      <section id="spaces" className={styles.spaces}>
        <div className={styles.sectionIntro}>
          <p>ONE LINK, MORE POSSIBILITIES</p>
          <h2>
            從一頁開始，
            <br />
            長成你的品牌。
          </h2>
        </div>
        {products.map((product, index) => (
          <Link
            href={product.href}
            className={`${styles.spaceCard} ${index % 2 ? styles.reverse : ""}`}
            key={product.name}
          >
            <div className={styles.collage}>
              <div className={styles.backdrop} />
              {product.images.map((src, imageIndex) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  width={260}
                  height={540}
                  className={styles[`shot${imageIndex + 1}`]}
                />
              ))}
              <span className={styles.mascot}>••</span>
            </div>
            <div className={styles.spaceCopy}>
              <span>{product.index}</span>
              <h3>{product.name}</h3>
              <p>{product.label}</p>
              <i>
                <ArrowRight />
              </i>
            </div>
          </Link>
        ))}
      </section>

      <section className={styles.finalCta}>
        <div className={styles.stone} aria-hidden="true">
          <span>••</span>
        </div>
        <p>MORE THAN A LINK</p>
        <h2>
          你的全部，
          <br />
          從這一頁開始。
        </h2>
        <Link href={startHref}>
          立即建立你的 URBANLINKS <ArrowRight />
        </Link>
      </section>
    </main>
  );
}
