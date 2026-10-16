import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/supabase/server';
import CardServiceHeader from '../CardServiceHeader';
import CaseGallery from './CaseGallery';
import styles from '../case-studies.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { absolute: '客戶案例與設計示意 | URBANLINKS' },
  description: '瀏覽 URBANLINKS 服飾品牌、租屋平台實際網站，以及美業工作室與 LINE AI 整合的設計示意。',
};

export default async function CasesPage() {
  const user = await getSessionUser();
  return <main className={styles.casesPage}>
    <CardServiceHeader loggedIn={Boolean(user)} />
    <CaseGallery />
  </main>;
}
