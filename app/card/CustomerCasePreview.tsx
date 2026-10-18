import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { customerCases } from './customer-cases';
import styles from './case-studies.module.css';

export default function CustomerCasePreview() {
  return <section id="customer-cases" className={styles.homeSection} aria-labelledby="case-preview-title">
    <div className={styles.sectionHeading}><div><small>SELECTED WORK</small><h2 id="case-preview-title">客戶案例</h2></div><Link href="/card/cases">查看全部<ArrowRight size={17} /></Link></div>
    <div className={styles.previewGrid}>{customerCases.filter(item => item.kind === 'live').map(item => <Link className={styles.previewItem} href={`/card/cases#${item.id}`} key={item.id}>
      <div className={styles.previewImage}>{item.mobile ? <span className={styles.phone}><span className={styles.phoneScreen}><Image src={item.mobile} alt={`${item.name} 手機版實際網站截圖`} fill sizes="240px" /></span></span> : <Image src={item.image} alt={`${item.name} 實際網站截圖`} fill sizes="(max-width: 600px) 88vw, 33vw" />}<span>實際網站</span></div>
      <div className={styles.previewCaption}><div><small>{item.categoryLabel}</small><h3>{item.name}</h3></div><ArrowRight size={19} /></div>
    </Link>)}</div>
  </section>;
}
