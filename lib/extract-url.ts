// 從貼上的文字取出網址(例如「Check out this profile on Campsite.bio! https://campsite.bio/xxx」)
export function extractUrl(text: string) {
  const t = String(text ?? '').trim();
  const full = t.match(/https?:\/\/[^\s"'<>，。、]+/i);
  if (full) return full[0].replace(/[)\]}.,!?]+$/, '');
  // 沒寫 https:// 的網址:分享文字裡常有「on Campsite.bio!」這種品牌字,優先選有路徑(/帳號)的那個
  const bare = [...t.matchAll(/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>，。、]*)?/gi)].map((m) => m[0].replace(/[)\]}.,!?]+$/, ''));
  const best = bare.find((x) => /\/[^/]/.test(x)) ?? bare[bare.length - 1];
  return best ? `https://${best}` : t;
}
