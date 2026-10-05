import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Link2,
  Menu,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { getSessionUser } from "@/lib/supabase/server";
import { SERVICE_LOGO } from "@/lib/card-plan";
import styles from "./landing.module.css";

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

function PhoneUi({ shop = false }: { shop?: boolean }) {
  if (shop)
    return (
      <div className={`${styles.phoneUi} ${styles.shopUi}`}>
        <div className={styles.shopBar}>
          <b>URBANITE</b>
          <ShoppingBag size={11} />
        </div>
        <div className={styles.shopPortrait} />
        <div className={styles.shopTabs}>NEW　 TOP　 OUTER</div>
        <div className={styles.shopProducts}>
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  return (
    <div className={styles.phoneUi}>
      <div className={styles.avatar} />
      <b>Brenda</b>
      <small>Creator / Lifestyle</small>
      {["Instagram", "LINE", "Shop", "Portfolio"].map((item) => (
        <span key={item}>
          {item}
          <ArrowRight size={8} />
        </span>
      ))}
      <div className={styles.miniGallery}>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export default async function CardServicePage() {
  const user = await getSessionUser();
  const startHref = user ? "/mycard" : "/card/register";
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/card" aria-label="URBANLINKS 首頁">
          <Image src={SERVICE_LOGO} alt="URBANLINKS" width={126} height={24} />
        </Link>
        <div className={styles.headerActions}>
          <Link href={startHref} className={styles.topCta}>
            {user ? "我的頁面" : "立即開始"}
            <ArrowRight size={15} />
          </Link>
          <details className={styles.menu}>
            <summary aria-label="開啟選單">
              <Menu />
            </summary>
            <nav>
              <a href="#spaces">產品服務</a>
              <Link href="/card/business">品牌官網</Link>
              <Link href={user ? "/mycard/upgrade" : "/card/register"}>
                方案價格
              </Link>
              <Link href={startHref}>開始建立</Link>
            </nav>
          </details>
        </div>
      </header>

      <section className={styles.hero}>
        <Image
          src="/card/urbanlinks-hero-v2.webp"
          alt="手持 URBANLINKS 個人名片與購物網站"
          fill
          priority
          sizes="(max-width: 760px) 100vw, 1200px"
          className={styles.heroPhoto}
        />
        <div className={styles.heroCopy}>
          <p>YOUR SPACE · ONE LINK</p>
          <h1>
            一個網址，
            <br />
            放進你的全部。
          </h1>
          <div className={styles.rule} />
          <div className={styles.socials} aria-label="支援的內容">
            <span>
              <Camera />
            </span>
            <span>
              <MessageCircle />
            </span>
            <span>
              <ShoppingBag />
            </span>
            <span>
              <Link2 />
            </span>
            <span>•••</span>
          </div>
          <em>
            All in one.
            <br />
            Just for you.
          </em>
        </div>
        <div className={`${styles.screenOverlay} ${styles.screenBack}`}>
          <PhoneUi shop />
        </div>
        <div className={`${styles.screenOverlay} ${styles.screenFront}`}>
          <PhoneUi />
        </div>
        <Link href="/@urbanite" className={styles.urlCapsule}>
          urbanlinks.tw/yourname{" "}
          <span>
            <ArrowRight />
          </span>
        </Link>
      </section>

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
