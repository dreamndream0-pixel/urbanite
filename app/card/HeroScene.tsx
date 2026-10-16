import Image from "next/image";
import Link from "next/link";
import { Caveat } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { SERVICE_LOGO } from "@/lib/card-plan";
import HeroExperience from "./HeroExperience";
import CardMenu from "./CardMenu";
import styles from "./hero.module.css";

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
    <div className={script.variable}>
      {/* 表頭:獨立一條,跟下面的主視覺分開 */}
      <header className={styles.topbar}>
        <Link className={styles.topBrand} href="/card" aria-label="URBANLINKS 首頁">
          <Image src="/brand/u-logo.png" alt="" width={74} height={70} className={styles.topMark} priority />
          <Image src={SERVICE_LOGO} alt="URBANLINKS" width={184} height={36} className={styles.topName} priority />
        </Link>
        <div className={styles.topActions}>
          <Link href={startHref} className={styles.start}>
            建立名片
            <ArrowRight />
          </Link>
          <CardMenu
            loggedIn={loggedIn}
            links={[
              { href: "#spaces", label: "產品服務" },
              { href: "/card/business", label: "品牌官網" },
              { href: "/card/pricing", label: "方案價格" },
            ]}
          />
        </div>
      </header>
      <HeroExperience startHref={startHref} loggedIn={loggedIn} />
    </div>
  );
}
