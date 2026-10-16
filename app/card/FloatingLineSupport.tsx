import { CONTACT_LINE_URL } from '@/lib/card-plan';
import SocialIcon from '@/app/components/SocialIcon';
import styles from './case-studies.module.css';

export default function FloatingLineSupport() {
  return <a className={styles.lineSupport} href={CONTACT_LINE_URL} target="_blank" rel="noopener noreferrer" aria-label="透過 LINE 聯繫客服專員">
    <span className={styles.lineLogo}><SocialIcon type="line" size={31} /></span>
    <span><strong>聯繫客服專員</strong><small>LINE</small></span>
  </a>;
}
