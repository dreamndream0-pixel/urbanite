// 頁尾最下方的「隱私權政策」「使用者條款」:存在 footer_sections 的獨立區塊,不顯示在頁尾欄位裡
// 後台「系統設定 → 頁尾資訊 → 隱私權政策 / 使用者條款」編輯;前台頁尾最下方連到 /footer/區塊/項目
import type { SiteSettings } from '@/lib/types';

type Sections = NonNullable<SiteSettings['footer_sections']>;
export type PolicyKind = 'privacy' | 'terms';

export const POLICY_SECTION_TITLE = '條款與政策 POLICIES';
export const POLICY_LABEL: Record<PolicyKind, string> = { privacy: '隱私權政策', terms: '使用者條款' };

export function isPolicySubtitle(subtitle: string, kind?: PolicyKind) {
  const s = subtitle ?? '';
  const privacy = s.includes('隱私權政策') || /privacy/i.test(s);
  const terms = s.includes('使用者條款') || s.includes('服務條款') || /terms/i.test(s);
  if (kind === 'privacy') return privacy;
  if (kind === 'terms') return terms;
  return privacy || terms;
}

// 目前的條款內容:優先讀獨立區塊,沒有再找舊資料(放在其他欄位裡的同名項目)
export function policyText(sections: Sections | undefined | null, kind: PolicyKind) {
  const list = sections ?? [];
  const own = list.find((s) => s.title === POLICY_SECTION_TITLE)?.items.find((i) => isPolicySubtitle(i.subtitle, kind));
  if (own) return own.content ?? '';
  for (const s of list) {
    const item = s.items.find((i) => isPolicySubtitle(i.subtitle, kind) && (i.content ?? '').trim());
    if (item) return item.content ?? '';
  }
  return '';
}

// 移除所有條款項目(後台頁尾欄位編輯器不顯示它們)
export function stripPolicies(sections: Sections | undefined | null): Sections {
  return (sections ?? [])
    .filter((s) => s.title !== POLICY_SECTION_TITLE)
    .map((s) => ({ ...s, items: s.items.filter((i) => !isPolicySubtitle(i.subtitle)) }));
}

// 存檔:條款區塊放最前面(前台找連結時優先用它),其他欄位裡的同名項目移除
export function withPolicies(sections: Sections, texts: Record<PolicyKind, string>): Sections {
  const items = (Object.keys(POLICY_LABEL) as PolicyKind[])
    .filter((k) => texts[k].trim())
    .map((k) => ({ subtitle: POLICY_LABEL[k], content: texts[k].trim(), url: '' }));
  const rest = stripPolicies(sections);
  return items.length ? [{ title: POLICY_SECTION_TITLE, items }, ...rest] : rest;
}
