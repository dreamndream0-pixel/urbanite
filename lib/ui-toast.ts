// 膠囊提示:畫面置中出現、約 3 秒淡出,不需要按確定
// 用法:uiToast('已入庫')
// 由 <ToastHost/>(掛在 root layout)訂閱並顯示。

export type Toast = { id: number; message: string };

let current: Toast | null = null;
let seq = 1;
const listeners = new Set<() => void>();

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToast(): Toast | null {
  return current;
}

export function uiToast(message: string) {
  current = { id: seq++, message };
  for (const l of listeners) l();
}

export function clearToast(id: number) {
  if (current?.id !== id) return;
  current = null;
  for (const l of listeners) l();
}
