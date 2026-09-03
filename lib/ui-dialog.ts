// 全站自製對話框:取代瀏覽器原生 alert / confirm / prompt。
// 用法(需在 async 函式內):
//   await uiAlert('已儲存');
//   if (!await uiConfirm('確定刪除?')) return;
//   const v = await uiPrompt('請輸入原因');  // 取消回傳 null
// 由 <DialogHost/>(掛在 root layout)訂閱並顯示。

export type DialogKind = 'alert' | 'confirm' | 'prompt';

export type DialogRequest = {
  id: number;
  kind: DialogKind;
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (value: boolean | string | null) => void;
};

type Options = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
};

let queue: DialogRequest[] = [];
let seq = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDialogQueue(): DialogRequest[] {
  return queue;
}

function push(req: Omit<DialogRequest, 'id' | 'resolve'>): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    queue = [...queue, { ...req, id: seq++, resolve }];
    emit();
  });
}

export function settleDialog(id: number, value: boolean | string | null) {
  const req = queue.find((q) => q.id === id);
  queue = queue.filter((q) => q.id !== id);
  emit();
  req?.resolve(value);
}

export function uiAlert(message: string, opts: Options = {}): Promise<void> {
  return push({ kind: 'alert', message, ...opts }).then(() => undefined);
}

export function uiConfirm(message: string, opts: Options = {}): Promise<boolean> {
  return push({ kind: 'confirm', message, ...opts }).then((v) => v === true);
}

export function uiPrompt(message: string, opts: Options = {}): Promise<string | null> {
  return push({ kind: 'prompt', message, defaultValue: opts.defaultValue ?? '', ...opts }).then((v) =>
    typeof v === 'string' ? v : null,
  );
}
