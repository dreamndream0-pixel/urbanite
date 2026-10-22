'use client';
import CardMenu from '@/app/card/CardMenu';
import SetupClient from '@/app/mycard/setup/SetupClient';

export default function BusinessIdentityFixture({ app = false }: { app?: boolean }) {
  return <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
    <header className="flex justify-between border-b bg-white px-5 py-4"><strong>URBANLINKS</strong><CardMenu loggedIn appNav={app ? { title: '預約管理', items: [{ href: '/mycard/booking', label: '預約總覽' }] } : undefined} /></header>
    <SetupClient name="測試甜點店" slug="demo-store" />
  </main>;
}
