// 商品描述等 HTML 文字:清掉從備忘錄、Word、網頁貼上時夾帶的字體、字級、行高等樣式,
// 讓前台統一使用網站字體;保留粗體、斜體、底線、對齊與自訂顏色(純黑視為貼上殘留,一併移除)。
const KEEP = new Set(['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'color']);
const BLACK = /^(black|#000(000)?|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(,\s*1(\.0+)?\s*)?\))$/i;

function cleanStyle(style: string) {
  return style
    .split(';')
    .map((rule) => {
      const i = rule.indexOf(':');
      if (i < 0) return '';
      const prop = rule.slice(0, i).trim().toLowerCase();
      const value = rule.slice(i + 1).trim();
      if (!KEEP.has(prop) || !value) return '';
      if (prop === 'color' && BLACK.test(value)) return '';
      if (prop === 'font-weight' && /^(normal|400)$/i.test(value)) return '';
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

export function cleanRichText(html: string) {
  if (!html) return html;
  return html
    // 樣式屬性只留允許的項目
    .replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_, q: string, style: string) => {
      const kept = cleanStyle(style.replace(/&quot;/g, '"'));
      return kept ? ` style=${q}${kept}${q}` : '';
    })
    // <font face/size> 去掉字體與字級(保留 color)
    .replace(/<font\b([^>]*)>/gi, (_, attrs: string) => `<font${attrs.replace(/\s(face|size)\s*=\s*(["'])[^"']*\2/gi, '')}>`)
    // Apple / Office 的樣式 class
    .replace(/\sclass\s*=\s*(["'])(?:[ps]\d+|Mso\w*|Apple-\w+)(?:\s+(?:[ps]\d+|Mso\w*|Apple-\w+))*\1/gi, '');
}
