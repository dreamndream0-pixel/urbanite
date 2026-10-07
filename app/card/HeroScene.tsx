import Image from "next/image";
import Link from "next/link";
import { Caveat, LXGW_WenKai_TC } from "next/font/google";
import { ArrowRight, Ellipsis, Link2, Menu, ShoppingBag } from "lucide-react";
import SocialIcon from "@/app/components/SocialIcon";
import { SERVICE_LOGO } from "@/lib/card-plan";
import ScrollHero from "./ScrollHero";
import HeroImportBubble from "./HeroImportBubble";
import DemoPhoneContent from "./DemoPhoneContent";
import styles from "./hero.module.css";

const handwriting = LXGW_WenKai_TC({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--hero-hand",
});
const script = Caveat({
  weight: "500",
  subsets: ["latin"],
  display: "swap",
  variable: "--hero-script",
});

export default function HeroScene({
  startHref,
  loggedIn,
}: {
  startHref: string;
  loggedIn: boolean;
}) {
  return (
    <div className={`${handwriting.variable} ${script.variable}`}>
      <ScrollHero>
        <picture>
          <source
            media="(max-width: 760px)"
            srcSet="/card/hero-studio-mobile.webp"
          />
          <Image
            className={styles.background}
            src="/card/hero-studio.webp"
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
          />
        </picture>
        <div className={styles.scene}>
          <header className={styles.header}>
            <Link
              className={styles.brand}
              href="/card"
              aria-label="URBANLINKS 首頁"
            >
              <Image
                src="/brand/u-logo.png"
                alt=""
                width={74}
                height={70}
                className={styles.brandMark}
                priority
              />
              <Image
                src={SERVICE_LOGO}
                alt="URBANLINKS"
                width={184}
                height={36}
                className={styles.brandName}
                priority
              />
            </Link>
            <div className={styles.headerActions}>
              <Link href={startHref} className={styles.start}>
                {loggedIn ? "我的頁面" : "立即開始"}
                <ArrowRight />
              </Link>
              <details className={styles.menu}>
                <summary aria-label="開啟選單">
                  <Menu />
                </summary>
                <nav aria-label="網站導覽">
                  <a href="#spaces">產品服務</a>
                  <Link href="/card/business">品牌官網</Link>
                  <Link href={loggedIn ? "/mycard/upgrade" : "/card/register"}>
                    方案價格
                  </Link>
                  <Link href={startHref}>開始建立</Link>
                </nav>
              </details>
            </div>
          </header>
          <div className={styles.copy}>
            <h1>
              <span>一個網址，</span>
              <span>放進你的全部。</span>
            </h1>
            <div className={styles.underline} aria-hidden="true" />
            <ul className={styles.socials} aria-label="社群、商店與連結整合">
              <li title="Instagram">
                <SocialIcon type="instagram" />
              </li>
              <li title="LINE">
                <SocialIcon type="line" />
              </li>
              <li title="商店">
                <ShoppingBag />
              </li>
              <li title="連結">
                <Link2 />
              </li>
              <li title="更多內容">
                <Ellipsis />
              </li>
            </ul>
          </div>
          <p className={styles.note}>
            All in one.
            <br />
            Just for you.
            <span aria-hidden="true" />
          </p>
          <div
            className={styles.phones}
            role="img"
            aria-label="個人名片與購物網站手機示意，隨頁面捲動展示內容"
          >
            <div
              className={`${styles.phone} ${styles.backPhone}`}
              aria-hidden="true"
            >
              <div className={styles.screen}>
                <DemoPhoneContent shop />
              </div>
              <span className={styles.notch} />
            </div>
            <div
              className={`${styles.phone} ${styles.frontPhone}`}
              aria-hidden="true"
            >
              <div className={styles.screen}>
                <DemoPhoneContent />
              </div>
              <span className={styles.notch} />
            </div>
          </div>
          <HeroImportBubble loggedIn={loggedIn} />
          <span className={styles.flourish} aria-hidden="true" />
        </div>
      </ScrollHero>
    </div>
  );
}
