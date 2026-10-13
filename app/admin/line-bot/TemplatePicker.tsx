'use client';

import FlexView from './FlexView';

// 卡片模板挑選:縮圖預覽,點一下套用
export default function TemplatePicker({
  options,
  value,
  onChange,
  render,
  extra,
}: {
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  render: (key: string) => Record<string, unknown>;
  extra?: { key: string; label: string; hint: string };
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {extra ? (
        <button
          type="button"
          onClick={() => onChange(extra.key)}
          className={`flex w-[118px] shrink-0 flex-col items-center justify-center rounded-xl border-2 p-2 text-center ${value === extra.key ? 'border-[#1f1b19] bg-[#faf7f2]' : 'border-[#ebe4da] bg-white'}`}
        >
          <span className="text-xs font-medium text-[#1f1b19]">{extra.label}</span>
          <span className="mt-1 text-[10px] leading-4 text-[#a99e8f]">{extra.hint}</span>
        </button>
      ) : null}
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`w-[118px] shrink-0 overflow-hidden rounded-xl border-2 bg-[#8fa6c3] p-1.5 text-left transition ${value === o.key ? 'border-[#1f1b19]' : 'border-transparent opacity-80 hover:opacity-100'}`}
        >
          <div className="pointer-events-none max-h-[150px] overflow-hidden">
            <FlexView contents={render(o.key)} scale={0.34} />
          </div>
          <span className={`mt-1 block truncate rounded-md px-1.5 py-0.5 text-center text-[11px] ${value === o.key ? 'bg-[#1f1b19] font-semibold text-white' : 'bg-white/90 text-[#1f1b19]'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
