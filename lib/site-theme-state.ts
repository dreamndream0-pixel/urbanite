import { resolveSiteTheme } from './site-theme';

export function editableSiteTheme(raw: unknown) {
  const stored = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return resolveSiteTheme(stored.draft ?? stored);
}
export function draftSiteTheme(published: unknown, draft: unknown) {
  return { ...resolveSiteTheme(published), draft: resolveSiteTheme(draft) };
}
