'use client';

import { useState, type InputHTMLAttributes } from 'react';

// 數字輸入框:輸入中保留使用者打的文字(可以整個刪光、不會卡著 0 或 1),
// 離開欄位後才顯示實際存下的數值;開頭多餘的 0 會自動去掉
export default function NumberInput({ value, onChange, onFocus, onBlur, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode ?? 'decimal'}
      value={text ?? (value ?? '')}
      onFocus={(e) => { setText(e.target.value); onFocus?.(e); }}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
        setText(cleaned);
        onChange?.(e);
      }}
      onBlur={(e) => { setText(null); onBlur?.(e); }}
    />
  );
}
