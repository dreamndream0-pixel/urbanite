import Image from "next/image";
import Link from "next/link";
import { Caveat, LXGW_WenKai_TC } from "next/font/google";
import {
  ArrowRight,
  ChevronRight,
  Ellipsis,
  Layers,
  Link2,
  Mail,
  Menu,
  Search,
  ShoppingBag,
} from "lucide-react";
import SocialIcon from "@/app/components/SocialIcon";
import { SERVICE_LOGO } from "@/lib/card-plan";
import ScrollHero from "./ScrollHero";
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

function Gallery() {
  return (
    <div className={styles.gallery}>
      <Image src="/card/demo-fashion.webp" alt="" width={150} height={180} />
      <Image src="/card/demo-collection.webp" alt="" width={150} height={180} />
      <Image src="/card/demo-creator.webp" alt="" width={150} height={180} />
    </div>
  );
}

function DemoPage({ shop = false }: { shop?: boolean }) {
  return (
    <div
      className={`${styles.screenContent} ${shop ? styles.shopContent : styles.profileContent}`}
    >
      {shop ? (
        <>
          <div className={styles.shopHeader}>
            <Search />
            <strong>URBANITE</strong>
            <ShoppingBag />
            <Menu />
          </div>
          <Image
            className={styles.fashionBanner}
            src="/card/demo-fashion.webp"
            alt="服飾商店示意"
            width={480}
            height={600}
          />
          <div className={styles.categories}>
            <span>TOP</span>
            <span>OUTER</span>
            <span>DRESS</span>
          </div>
          <div className={styles.productGrid}>
            <div>
              <Image
                src="/card/demo-collection.webp"
                alt=""
                width={200}
                height={260}
              />
              <span>Everyday essentials</span>
              <small>NT$ 1,280</small>
            </div>
            <div>
              <Image
                src="/card/demo-fashion.webp"
                alt=""
                width={200}
                height={260}
              />
              <span>Soft layers</span>
              <small>NT$ 980</small>
            </div>
          </div>
          <p className={styles.editorialTitle}>Made for your everyday.</p>
          <Gallery />
        </>
      ) : (
        <>
          <span className={styles.phoneTime}>9:41</span>
          <Image
            className={styles.avatar}
            src="/card/demo-fashion.webp"
            alt="創作者 Brenda 示意"
            width={200}
            height={200}
          />
          <strong className={styles.profileName}>Brenda</strong>
          <p className={styles.bio}>Creator / Lifestyle / Rental</p>
          <div className={styles.profileLinks}>
            <div>
              <SocialIcon type="instagram" />
              <span>Instagram</span>
              <ChevronRight />
            </div>
            <div>
              <SocialIcon type="line" />
              <span>LINE</span>
              <ChevronRight />
            </div>
            <div>
              <ShoppingBag />
              <span>Shop</span>
              <ChevronRight />
            </div>
            <div>
              <Layers />
              <span>Portfolio</span>
              <ChevronRight />
            </div>
            <div>
              <Mail />
              <span>Contact</span>
              <ChevronRight />
            </div>
          </div>
          <Gallery />
          <p className={styles.editorialTitle}>Little moments, my way.</p>
          <Image
            className={styles.storyImage}
            src="/card/demo-creator.webp"
            alt=""
            width={360}
            height={400}
          />
        </>
      )}
    </div>
  );
}

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
                <DemoPage shop />
              </div>
              <span className={styles.notch} />
            </div>
            <div
              className={`${styles.phone} ${styles.frontPhone}`}
              aria-hidden="true"
            >
              <div className={styles.screen}>
                <DemoPage />
              </div>
              <span className={styles.notch} />
            </div>
          </div>
          <div className={styles.urlBubble}>
            <span>urbanlinks.tw/yourname</span>
            <Link href={startHref} aria-label="建立你的 URBANLINKS 頁面">
              <ArrowRight />
            </Link>
          </div>
          <span className={styles.flourish} aria-hidden="true" />
        </div>
      </ScrollHero>
    </div>
  );
}
