import {
  Award, Baby, Bell, Bike, BookOpen, Bookmark, Briefcase, Cake, Calendar, Camera, Car, ChartColumn, CircleHelp,
  ClipboardList, Clock, Coffee, CreditCard, Crown, Download, Dog, Dumbbell, FileText, Flame, Flower2, Gem, Gift,
  Globe, GraduationCap, Hand, Handshake, Hash, Headphones, Heart, House, Image, Info, Laptop, Leaf, Lightbulb, Link,
  Lock, Mail, Map, MapPin, Megaphone, MessageCircle, Moon, Music, Newspaper, Package, Palette, PawPrint, Percent,
  Phone, Plane, Play, QrCode, Recycle, Rocket, Ruler, Scissors, Search, Send, Settings, Share2, ShieldCheck, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Smile, Sparkles, Sprout, Star, Store, Sun, Tag, Target, ThumbsUp, Ticket,
  Timer, Trophy, Truck, Umbrella, User, Users, Utensils, Video, Wallet, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import SocialIcon from '@/app/components/SocialIcon';

// 名片連結按鈕的縮圖圖示:存成 block.image = 'icon:<key>'
export const ICON_PREFIX = 'icon:';
export const isIconImage = (value: string | null | undefined) => Boolean(value && value.startsWith(ICON_PREFIX));

type IconDef = { key: string; label: string; Icon?: LucideIcon; social?: string };

// 前 16 個是最常用的(後台預設顯示 2 排),其餘收在「顯示更多」
export const LINK_ICONS: IconDef[] = [
  { key: 'instagram', label: 'Instagram', social: 'instagram' },
  { key: 'line', label: 'LINE', social: 'line' },
  { key: 'facebook', label: 'Facebook', social: 'facebook' },
  { key: 'threads', label: 'Threads', social: 'threads' },
  { key: 'youtube', label: 'YouTube', social: 'youtube' },
  { key: 'tiktok', label: 'TikTok', social: 'tiktok' },
  { key: 'shopping-bag', label: '購物袋', Icon: ShoppingBag },
  { key: 'gift', label: '禮物', Icon: Gift },
  { key: 'tag', label: '標籤', Icon: Tag },
  { key: 'ticket', label: '優惠券', Icon: Ticket },
  { key: 'truck', label: '運送', Icon: Truck },
  { key: 'heart', label: '愛心', Icon: Heart },
  { key: 'star', label: '星星', Icon: Star },
  { key: 'message', label: '訊息', Icon: MessageCircle },
  { key: 'calendar', label: '日期', Icon: Calendar },
  { key: 'map-pin', label: '地點', Icon: MapPin },
  // ---- 社群 ----
  { key: 'x', label: 'X', social: 'x' },
  { key: 'pinterest', label: 'Pinterest', social: 'pinterest' },
  { key: 'xiaohongshu', label: '小紅書', social: 'xiaohongshu' },
  // ---- 購物 ----
  { key: 'shopping-cart', label: '購物車', Icon: ShoppingCart },
  { key: 'store', label: '商店', Icon: Store },
  { key: 'percent', label: '折扣', Icon: Percent },
  { key: 'credit-card', label: '信用卡', Icon: CreditCard },
  { key: 'wallet', label: '錢包', Icon: Wallet },
  { key: 'package', label: '包裹', Icon: Package },
  { key: 'shirt', label: '衣服', Icon: Shirt },
  { key: 'scissors', label: '剪刀', Icon: Scissors },
  { key: 'ruler', label: '尺寸', Icon: Ruler },
  { key: 'palette', label: '色票', Icon: Palette },
  { key: 'gem', label: '寶石', Icon: Gem },
  { key: 'crown', label: '皇冠', Icon: Crown },
  { key: 'sparkles', label: '閃亮', Icon: Sparkles },
  { key: 'flame', label: '熱賣', Icon: Flame },
  { key: 'zap', label: '閃電', Icon: Zap },
  { key: 'award', label: '獎章', Icon: Award },
  { key: 'trophy', label: '獎盃', Icon: Trophy },
  { key: 'thumbs-up', label: '讚', Icon: ThumbsUp },
  { key: 'smile', label: '笑臉', Icon: Smile },
  // ---- 聯絡 ----
  { key: 'phone', label: '電話', Icon: Phone },
  { key: 'smartphone', label: '手機', Icon: Smartphone },
  { key: 'mail', label: '信件', Icon: Mail },
  { key: 'send', label: '傳送', Icon: Send },
  { key: 'bell', label: '通知', Icon: Bell },
  { key: 'megaphone', label: '公告', Icon: Megaphone },
  { key: 'link', label: '連結', Icon: Link },
  { key: 'globe', label: '網站', Icon: Globe },
  { key: 'share', label: '分享', Icon: Share2 },
  { key: 'qr-code', label: 'QR Code', Icon: QrCode },
  { key: 'user', label: '個人', Icon: User },
  { key: 'users', label: '社群', Icon: Users },
  { key: 'handshake', label: '合作', Icon: Handshake },
  { key: 'hand', label: '招手', Icon: Hand },
  // ---- 時間地點 ----
  { key: 'clock', label: '時間', Icon: Clock },
  { key: 'timer', label: '計時', Icon: Timer },
  { key: 'map', label: '地圖', Icon: Map },
  { key: 'house', label: '首頁', Icon: House },
  { key: 'plane', label: '旅行', Icon: Plane },
  { key: 'car', label: '開車', Icon: Car },
  { key: 'bike', label: '單車', Icon: Bike },
  // ---- 內容 ----
  { key: 'camera', label: '相機', Icon: Camera },
  { key: 'image', label: '圖片', Icon: Image },
  { key: 'video', label: '影片', Icon: Video },
  { key: 'play', label: '播放', Icon: Play },
  { key: 'music', label: '音樂', Icon: Music },
  { key: 'headphones', label: '耳機', Icon: Headphones },
  { key: 'book', label: '書本', Icon: BookOpen },
  { key: 'file', label: '文件', Icon: FileText },
  { key: 'newspaper', label: '新聞', Icon: Newspaper },
  { key: 'clipboard', label: '表單', Icon: ClipboardList },
  { key: 'bookmark', label: '收藏', Icon: Bookmark },
  { key: 'download', label: '下載', Icon: Download },
  { key: 'search', label: '搜尋', Icon: Search },
  { key: 'info', label: '資訊', Icon: Info },
  { key: 'help', label: '常見問題', Icon: CircleHelp },
  { key: 'hash', label: '主題標籤', Icon: Hash },
  { key: 'chart', label: '數據', Icon: ChartColumn },
  // ---- 生活 ----
  { key: 'coffee', label: '咖啡', Icon: Coffee },
  { key: 'utensils', label: '美食', Icon: Utensils },
  { key: 'cake', label: '甜點', Icon: Cake },
  { key: 'leaf', label: '葉子', Icon: Leaf },
  { key: 'flower', label: '花朵', Icon: Flower2 },
  { key: 'sprout', label: '新芽', Icon: Sprout },
  { key: 'sun', label: '太陽', Icon: Sun },
  { key: 'moon', label: '月亮', Icon: Moon },
  { key: 'umbrella', label: '雨傘', Icon: Umbrella },
  { key: 'dumbbell', label: '運動', Icon: Dumbbell },
  { key: 'baby', label: '親子', Icon: Baby },
  { key: 'dog', label: '狗狗', Icon: Dog },
  { key: 'paw', label: '寵物', Icon: PawPrint },
  { key: 'recycle', label: '環保', Icon: Recycle },
  // ---- 工作 ----
  { key: 'briefcase', label: '工作', Icon: Briefcase },
  { key: 'laptop', label: '筆電', Icon: Laptop },
  { key: 'graduation', label: '課程', Icon: GraduationCap },
  { key: 'lightbulb', label: '靈感', Icon: Lightbulb },
  { key: 'rocket', label: '新上線', Icon: Rocket },
  { key: 'target', label: '目標', Icon: Target },
  { key: 'lock', label: '會員', Icon: Lock },
  { key: 'shield', label: '保固', Icon: ShieldCheck },
  { key: 'settings', label: '設定', Icon: Settings },
  { key: 'wrench', label: '維修', Icon: Wrench },
];

export function iconDef(value: string | null | undefined) {
  if (!isIconImage(value)) return undefined;
  const key = (value as string).slice(ICON_PREFIX.length);
  return LINK_ICONS.find((i) => i.key === key);
}

// 顯示圖示(顏色跟著文字顏色)
export default function LinkIcon({ value, size = 20 }: { value: string; size?: number }) {
  const def = iconDef(value);
  if (!def) return null;
  if (def.social) return <SocialIcon type={def.social} size={size} />;
  const Icon = def.Icon!;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
