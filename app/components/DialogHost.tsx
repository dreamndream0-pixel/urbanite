'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getDialogQueue, subscribeDialogs, settleDialog, type DialogRequest } from '@/lib/ui-dialog';

export default function DialogHost() {
  const queue = useSyncExternalStore(subscribeDialogs, getDialogQueue, () => getDialogQueue());
  const current: DialogRequest | undefined = queue[0];
  const [value, setValue] = useState('');

  useEffect(() => {
    if (current?.kind === 'prompt') setValue(current.defaultValue ?? '');
  }, [current?.id, current?.kind, current?.defaultValue]);

  if (!current) return null;

  const confirmLabel = current.confirmText ?? (current.kind === 'alert' ? '確定' : '確定');
  const cancelLabel = current.cancelText ?? '取消';

  function done(v: boolean | string | null) {
    if (current) settleDialog(current.id, v);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={() => (current.kind === 'alert' ? done(true) : done(current.kind === 'confirm' ? false : null))}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {current.title ? <h2 className="mb-1 text-lg font-semibold text-[#1f1b19]">{current.title}</h2> : null}
        <p className="whitespace-pre-wrap text-sm leading-6 text-[#3f3a34]">{current.message}</p>

        {current.kind === 'prompt' ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={current.placeholder ?? ''}
            onKeyDown={(e) => { if (e.key === 'Enter') done(value); }}
            className="mt-3 w-full rounded-lg border border-[#e5ded4] px-3 py-2.5 text-sm"
          />
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          {current.kind !== 'alert' ? (
            <button
              onClick={() => done(current.kind === 'confirm' ? false : null)}
              className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            autoFocus={current.kind !== 'prompt'}
            onClick={() => done(current.kind === 'confirm' ? true : current.kind === 'prompt' ? value : true)}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${current.danger ? 'bg-[#c0392b] hover:bg-[#a83226]' : 'bg-[#1f1b19] hover:bg-[#000]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
