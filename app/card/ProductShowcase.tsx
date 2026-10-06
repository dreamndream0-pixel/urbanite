import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import DemoPhoneContent from "./DemoPhoneContent";
import FloatingShowcase from "./FloatingShowcase";
import TemplateCarousel from "./TemplateCarousel";
import styles from "./showcase.module.css";

const products = [
  {
    name: "LINK",
    label: "個人名片",
    index: "01",
    key: "link",
    href: "/card/register",
    left: "/card/demo-creator.webp",
    right: "/card/demo-fashion.webp",
  },
  {
    name: "SHOP",
    label: "購物商店",
    index: "02",
    key: "shop",
    href: "/card/business",
    left: "/card/demo-fashion.webp",
    right: "/card/demo-collection.webp",
  },
  {
    name: "BRAND",
    label: "品牌頁面",
    index: "03",
    key: "brand",
    href: "/card/business",
    left: "/card/templates/ciel-table.jpg",
    right: "/card/templates/velocraft.jpg",
  },
];

export default function ProductShowcase({ startHref }: { startHref: string }) {
  return (
    <FloatingShowcase>
      {products.map((product) => (
        <Fragment key={product.key}>
          <article
            data-floating-panel
            className={`${styles.panel} ${styles[product.key]}`}
          >
            <div className={styles.surface} aria-hidden="true">
              <div className={styles.paperOne} />
              <div className={styles.paperTwo} />
              <div className={styles.photoLeft}>
                <Image
                  src={product.left}
                  alt=""
                  fill
                  sizes="(max-width: 760px) 30vw, 280px"
                />
              </div>
              <div className={styles.photoRight}>
                <Image
                  src={product.right}
                  alt=""
                  fill
                  sizes="(max-width: 760px) 26vw, 250px"
                />
              </div>
            </div>
            <div className={styles.phoneCrop} aria-hidden="true">
              <div className={styles.phone}>
                <div className={styles.screen}>
                  {product.key === "brand" ? (
                    <Image
                      className={styles.brandScreen}
                      src="/card/templates/casa-mellow.jpg"
                      alt=""
                      width={575}
                      height={1280}
                      sizes="(max-width: 760px) 32vw, 240px"
                    />
                  ) : (
                    <DemoPhoneContent shop={product.key === "shop"} />
                  )}
                </div>
                <span className={styles.notch} />
              </div>
            </div>
            <div className={styles.copy}>
              <div className={styles.titleRow}>
                <h2>{product.name}</h2>
                <span>{product.index}</span>
              </div>
              <div className={styles.actionRow}>
                <p>{product.label}</p>
                <Link
                  href={product.key === "link" ? startHref : product.href}
                  aria-label={`建立${product.label}`}
                  title={`建立${product.label}`}
                >
                  <ArrowRight />
                </Link>
              </div>
            </div>
          </article>
          {product.key === "link" && <TemplateCarousel />}
        </Fragment>
      ))}
    </FloatingShowcase>
  );
}
