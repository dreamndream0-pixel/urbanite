export type TemplateCollection = {
  id: string;
  eyebrow: string;
  title: string;
  label: string;
  basePath: string;
  templates: { key: string; name: string; label: string }[];
};

export const linkCollection: TemplateCollection = {
  id: "link",
  eyebrow: "LINK COLLECTION",
  title: "一頁，無限種可能。",
  label: "網站設計示意",
  basePath: "/card/templates",
  templates: [
    { key: "casa-mellow", name: "CASA MELLOW", label: "居家選物" },
    { key: "petal-nail", name: "PETAL NAIL", label: "美甲工作室" },
    { key: "aurea-beauty", name: "AUREA BEAUTY", label: "美妝品牌" },
    { key: "lunea-clinic", name: "LUNÉA CLINIC", label: "醫美診所" },
    { key: "mellow-cast", name: "MELLOW CAST", label: "自媒體創作者" },
    { key: "velocraft", name: "VELOCRAFT", label: "單車生活" },
    { key: "sora-bean", name: "SORA BEAN", label: "咖啡品牌" },
    { key: "mona-atelier", name: "MONA ATELIER", label: "服飾品牌" },
    { key: "ciel-table", name: "CIEL TABLE", label: "餐飲品牌" },
  ],
};

export const shopCollection: TemplateCollection = {
  id: "shop",
  eyebrow: "SHOP COLLECTION",
  title: "為喜歡，開一間店。",
  label: "購物商店範本",
  basePath: "/card/templates/shop",
  templates: [
    { key: "lunora-studio", name: "LUNORA STUDIO", label: "服飾選品" },
    { key: "veloa-trail", name: "VELOA TRAIL", label: "單車與戶外裝備" },
    { key: "paw-co", name: "PAW & CO", label: "寵物生活用品" },
    { key: "papermint", name: "PAPERMINT", label: "質感文具" },
    { key: "bon-sucre", name: "BON SUCRÉ", label: "法式甜點" },
    { key: "nova-case", name: "NOVA CASE", label: "手機與科技配件" },
    { key: "ember-roast", name: "EMBER ROAST", label: "精品咖啡" },
    { key: "vera-glow", name: "VERA GLOW", label: "美妝保養" },
  ],
};
