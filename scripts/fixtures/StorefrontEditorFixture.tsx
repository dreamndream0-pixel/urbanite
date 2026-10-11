'use client';

import { useEffect, useState } from 'react';
import SiteThemeEditor from '@/app/admin/SiteThemeEditor';

// Browser tests mount this fixture only in a temporary, uncommitted local route.
export default function StorefrontEditorFixture() {
  const [initial, setInitial] = useState<unknown>(undefined);
  useEffect(() => { void fetch('/api/editor-fixture').then((res) => res.json()).then(setInitial); }, []);
  return <main className="mx-auto max-w-6xl p-4">{initial !== undefined && <SiteThemeEditor initial={initial} />}</main>;
}
