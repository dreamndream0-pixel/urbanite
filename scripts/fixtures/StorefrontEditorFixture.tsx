'use client';

import { useEffect, useState } from 'react';
import SiteThemeEditor from '@/app/admin/SiteThemeEditor';
import type { Banner } from '@/lib/types';

// Browser tests mount this fixture only in a temporary, uncommitted local route.
export default function StorefrontEditorFixture() {
  const [initial, setInitial] = useState<unknown>(undefined);
  const [banners, setBanners] = useState<Banner[]>([]);
  useEffect(() => { void fetch('/api/editor-fixture').then((res) => res.json()).then(setInitial); }, []);
  useEffect(() => { void fetch('/api/banners').then((res) => res.json()).then(setBanners); }, []);
  return <main className="mx-auto max-w-6xl p-4">{initial !== undefined && <SiteThemeEditor initial={initial} banners={banners} />}</main>;
}
