// 門市地圖選完後的回傳頁:彈出視窗 → postMessage 給結帳頁並關閉;同頁 → 存 localStorage 後回結帳頁
export type PickedStore = {
  store_id: string;
  store_name: string;
  store_phone: string;
  store_address: string;
  store_ship_type: string;
  store_lgs_type: string;
};

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

export function pickupStorePage(store: PickedStore) {
  const json = JSON.stringify(store).replace(/</g, '\u003c');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>門市已選擇</title></head><body><script>
(function(){
  var store = ${JSON.stringify(json)};
  try { localStorage.setItem('newebpay-pickup-store', store); } catch(e){}
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ type: 'newebpay-pickup-store', store: store }, window.location.origin); } catch(e){}
    window.close();
  } else {
    location.replace('/checkout');
  }
})();
</script><p>已選擇 ${esc(store.store_name)}，可關閉此視窗。</p></body></html>`;
}

export function pickupStoreErrorPage(message: string) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>門市選擇失敗</title></head><body><p>${esc(message)}</p><p><a href="/checkout">返回結帳頁</a></p></body></html>`;
}
