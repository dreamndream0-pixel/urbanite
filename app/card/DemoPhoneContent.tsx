import Image from "next/image";
import {
  ChevronRight,
  Layers,
  Mail,
  Menu,
  Search,
  ShoppingBag,
} from "lucide-react";
import SocialIcon from "@/app/components/SocialIcon";
import styles from "./hero.module.css";

function Gallery() {
  return (
    <div className={styles.gallery}>
      <Image src="/card/demo-fashion.webp" alt="" width={150} height={180} />
      <Image src="/card/demo-collection.webp" alt="" width={150} height={180} />
      <Image src="/card/demo-creator.webp" alt="" width={150} height={180} />
    </div>
  );
}

export default function DemoPhoneContent({ shop = false }: { shop?: boolean }) {
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
