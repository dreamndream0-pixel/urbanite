'use client';

import { useEffect, useState } from 'react';

export type LineMemberState = {
  loaded: boolean;
  loggedIn: boolean;
  bound: boolean;
  displayName: string;
  linkUrl: string; // 會員專屬 LINE 授權連結(加好友+綁定),未登入為空
  addFriendUrl: string;
};

// 前台各處「加入 LINE」共用:讀取會員的 LINE 綁定狀態與專屬授權連結
export function useLineMember(next = '/account') {
  const [state, setState] = useState<LineMemberState>({ loaded: false, loggedIn: false, bound: false, displayName: '', linkUrl: '', addFriendUrl: '' });

  useEffect(() => {
    let alive = true;
    fetch(`/api/me/line?next=${encodeURIComponent(next)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = res.ok ? await res.json() : null;
        if (!alive) return;
        setState({
          loaded: true,
          loggedIn: Boolean(data),
          bound: Boolean(data?.bound),
          displayName: data?.displayName ?? '',
          linkUrl: data?.linkUrl ?? '',
          addFriendUrl: data?.addFriendUrl ?? '',
        });
      })
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, [next]);

  return [state, setState] as const;
}
