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

// 貼上時讀取剪貼簿:iPhone「分享 → 拷貝」會同時放「文字」和「網址」兩份,
// 文字那份常常只有「Check out this profile on Campsite.bio!」,網址在另一份
export function pastedUrl(data: DataTransfer | null) {
  if (!data) return '';
  const get = (type: string) => {
    try {
      return data.getData(type) || '';
    } catch {
      return '';
    }
  };
  const uriList = get('text/uri-list').split(/\r?\n/).find((l) => l && !l.startsWith('#')) ?? '';
  const html = get('text/html');
  const href = (html.match(/href=["'](https?:\/\/[^"']+)["']/i) || [])[1] ?? '';
  const text = get('text/plain') || get('text');
  // 有帳號路徑的網址優先;都沒有才用文字裡抓到的
  const candidates = [uriList, href, extractUrl(text), extractUrl([text, uriList, href].join(' '))].filter((u) => /^https?:\/\//i.test(u));
  return candidates.find((u) => /^https?:\/\/[^/]+\/[^/\s]/i.test(u)) ?? candidates[0] ?? text.trim();
}
