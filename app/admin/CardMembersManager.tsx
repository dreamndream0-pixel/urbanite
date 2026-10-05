'use client';

import { useEffect, useMemo, useState } from 'react';
import { TIERS, tierInfo, type CardTier } from '@/lib/card-plan';
import { cardPath } from '@/lib/profile-card';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

type Member = {
  id: string;
  user_id: string | null;
  slug: string;
  name: string;
  avatar: string;
  email: string;
  provider: string;
  last_sign_in: string | null;
  published: boolean;
  onboarded: boolean;
  is_admin: boolean;
  tier: CardTier;
  expires_at: string | null;
  blocks: number;
  paid: number;
  referrer: string;
  referrals: number;
  referral_rewards: number;
  created_at: string;
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—');
const PROVIDER: Record<string, string> = { google: 'Google', email: 'Email', line: 'LINE' };
const TIER_COLOR: Record<string, string> = {
  free: 'bg-[#f3eee7] text-[#8a7f72]',
  plus: 'bg-[#efe6d6] text-[#7a5a22]',
  pro: 'bg-[#e3ebf5] text-[#1f3f6b]',
  max: 'bg-[#1f1b19] text-white',
};

// 近 N 天加入的人數
function joinedWithin(members: Member[], days: number) {
  const since = Date.now() - days * 86400000;
  return members.filter((m) => new Date(m.created_at).getTime() > since).length;
}

// 後台:名片服務的會員
export default function CardMembersManager() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | CardTier>('all');
  const [openId, setOpenId] = useState('');

  function load() {
    fetch('/api/admin/card-members')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? '讀取失敗');
        setMembers(d.members);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '讀取失敗'));
  }
  useEffect(load, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members ?? []).filter(
      (m) => (filter === 'all' || m.tier === filter) && (!q || [m.name, m.slug, m.email].some((v) => v.toLowerCase().includes(q))),
    );
  }, [members, query, filter]);

  if (error) return <p className="rounded-2xl border border-[#e8c4c4] bg-[#fbf3f0] p-4 text-sm text-[#a33a2b]">{error}</p>;
  if (!members) return <p className="p-6 text-sm text-[#8a7f72]">讀取中…</p>;

  const stats: [string, string][] = [
    ['名片會員', members.length.toLocaleString()],
    ['近 7 天新增', joinedWithin(members, 7).toLocaleString()],
    ['付費中', members.filter((m) => m.tier !== 'free' && !m.is_admin).length.toLocaleString()],
    ['累計收入', `NT$${members.reduce((n, m) => n + m.paid, 0).toLocaleString()}`],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#ebe4da] bg-white px-4 py-3">
            <p className="text-xs text-[#8a7f72]">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋名稱、網址代稱、Email"
          className="w-full rounded-xl border border-[#e5ded4] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#1f1b19]/40 sm:max-w-xs"
        />
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {(['all', ...TIERS.map((t) => t.key)] as ('all' | CardTier)[]).map((k) => {
            const n = k === 'all' ? members.length : members.filter((m) => m.tier === k).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${filter === k ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#5f5852]'}`}
              >
                {k === 'all' ? '全部' : tierInfo(k).name}({n})
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ebe4da] bg-white">
        {list.length === 0 ? <p className="p-6 text-center text-sm text-[#a99e8f]">沒有符合的會員</p> : null}
        {list.map((m) => (
          <div key={m.id} className="border-b border-[#f3eee7] last:border-0">
            <button type="button" onClick={() => setOpenId(openId === m.id ? '' : m.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#fcfaf7]">
              {m.avatar ? (
                <img src={m.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3eee7] text-sm text-[#8a7f72]">{(m.name || m.slug).slice(0, 1).toUpperCase()}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.name || '(未命名)'}</span>
                  {!m.onboarded ? <span className="shrink-0 text-[10px] text-[#c0392b]">尚未完成設定</span> : !m.published ? <span className="shrink-0 text-[10px] text-[#a99e8f]">未公開</span> : null}
                </span>
                <span className="block truncate text-xs text-[#a99e8f]">@{m.slug} · {m.email || '—'}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${TIER_COLOR[m.tier] ?? TIER_COLOR.free}`}>{tierInfo(m.tier).name}{m.is_admin ? '・管理員' : ''}</span>
            </button>
            {openId === m.id ? <MemberDetail m={m} onChanged={load} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemberDetail({ m, onChanged }: { m: Member; onChanged: () => void }) {
  const [tier, setTier] = useState<CardTier>(m.tier === 'free' ? 'plus' : m.tier);
  const [days, setDays] = useState('31');
  const [busy, setBusy] = useState(false);

  async function grant(nextTier: CardTier) {
    if (!m.user_id) return;
    const label = nextTier === 'free' ? `確定取消 ${m.name || m.slug} 的 ${tierInfo(m.tier).name}?會立即回到 U Free。` : `幫 ${m.name || m.slug} 開通 ${tierInfo(nextTier).name} ${days} 天?`;
    if (!(await uiConfirm(label))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/card-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: m.user_id, tier: nextTier, days: Number(days) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '更新失敗');
      onChanged();
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, React.ReactNode][] = [
    ['名片網址', <a key="u" href={cardPath(m.slug)} target="_blank" rel="noreferrer" className="underline underline-offset-2">urbanite.com.tw/@{m.slug}</a>],
    ['登入方式', PROVIDER[m.provider] ?? (m.provider || '—')],
    ['加入日期', date(m.created_at)],
    ['最近登入', date(m.last_sign_in)],
    ['方案到期', m.is_admin ? '管理員帳號,永久 U Max' : m.tier === 'free' ? '—' : date(m.expires_at)],
    ['連結與區塊', `${m.blocks} 個`],
    ['累計付款', `NT$${m.paid.toLocaleString()}`],
    ['推薦人', m.referrer ? `@${m.referrer}` : '—'],
    ['推薦人數', `${m.referrals} 位(已送 ${m.referral_rewards} 個月)`],
  ];

  return (
    <div className="space-y-4 bg-[#fcfaf7] px-4 pb-4 pt-1">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-20 shrink-0 text-[#8a7f72]">{k}</dt>
            <dd className="min-w-0 break-all">{v}</dd>
          </div>
        ))}
      </dl>
      {m.user_id && !m.is_admin ? (
        <div className="rounded-xl border border-[#ebe4da] bg-white p-3">
          <p className="mb-2 text-xs text-[#8a7f72]">手動開通方案(專員開通 U Pro / U Max、補償、贈送)</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={tier} onChange={(e) => setTier(e.target.value as CardTier)} className="rounded-lg border border-[#e5ded4] bg-white px-2.5 py-2 text-sm">
              {TIERS.filter((t) => t.key !== 'free').map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
            <select value={days} onChange={(e) => setDays(e.target.value)} className="rounded-lg border border-[#e5ded4] bg-white px-2.5 py-2 text-sm">
              <option value="7">7 天</option>
              <option value="31">1 個月</option>
              <option value="93">3 個月</option>
              <option value="186">6 個月</option>
              <option value="366">1 年</option>
            </select>
            <button type="button" disabled={busy} onClick={() => void grant(tier)} className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              開通
            </button>
            {m.tier !== 'free' ? (
              <button type="button" disabled={busy} onClick={() => void grant('free')} className="ml-auto text-xs text-[#c0392b] underline underline-offset-2 disabled:opacity-50">
                取消方案
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-[#a99e8f]">同等級會接在原到期日之後;換成其他等級從今天起算。</p>
        </div>
      ) : null}
    </div>
  );
}
