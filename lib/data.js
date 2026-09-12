import { calcCancelFeeForTime } from './paymentAuthorization.js';

// ── Japan International Airports ─────────────────────────────────────────────
export const JAPAN_AIRPORTS = [
  { code: 'NRT', name: '成田国際空港', nameEn: 'Narita International',  city: 'Tokyo',     emoji: '🗼', loc: 'Narita, Chiba',      lat: 35.7720, lng: 140.3929 },
  { code: 'HND', name: '羽田空港',     nameEn: 'Haneda Airport',         city: 'Tokyo',     emoji: '🗼', loc: 'Haneda, Tokyo',       lat: 35.5494, lng: 139.7798 },
  { code: 'KIX', name: '関西国際空港', nameEn: 'Kansai International',   city: 'Osaka',     emoji: '🏯', loc: 'Izumisano, Osaka',    lat: 34.4270, lng: 135.2441 },
  { code: 'NGO', name: '中部国際空港', nameEn: 'Centrair (Nagoya)',       city: 'Nagoya',    emoji: '🏙', loc: 'Tokoname, Aichi',     lat: 34.8583, lng: 136.8055 },
  { code: 'FUK', name: '福岡空港',     nameEn: 'Fukuoka Airport',         city: 'Fukuoka',   emoji: '🌸', loc: 'Fukuoka City',        lat: 33.5857, lng: 130.4511 },
  { code: 'CTS', name: '新千歳空港',   nameEn: 'New Chitose Airport',     city: 'Sapporo',   emoji: '❄️', loc: 'Chitose, Hokkaido',   lat: 42.7750, lng: 141.6922 },
  { code: 'OKA', name: '那覇空港',     nameEn: 'Naha Airport',            city: 'Okinawa',   emoji: '🌺', loc: 'Naha, Okinawa',       lat: 26.1958, lng: 127.6458 },
  { code: 'SDJ', name: '仙台空港',     nameEn: 'Sendai Airport',          city: 'Sendai',    emoji: '🌲', loc: 'Natori, Miyagi',      lat: 38.1397, lng: 140.9169 },
  { code: 'HIJ', name: '広島空港',     nameEn: 'Hiroshima Airport',       city: 'Hiroshima', emoji: '⛩', loc: 'Mihara, Hiroshima',   lat: 34.4361, lng: 132.9194 },
  { code: 'KMJ', name: '熊本空港',     nameEn: 'Kumamoto Airport',        city: 'Kumamoto',  emoji: '🏔', loc: 'Kikuyo, Kumamoto',    lat: 32.8373, lng: 130.8555 },
];

// ── Vehicle classes ──────────────────────────────────────────────────────────
export const VEHICLE_CLASSES = [
  { id: 'all',      label: 'All',        ja: 'すべて',   icon: '🚘', img: '/class-all.jpg' },
  { id: 'kei',      code: 'K',   label: 'K Kei Car',           ja: '軽自動車',       icon: 'K',   img: '/classes/kei-car.png' },
  { id: 'compact',  code: 'S',   label: 'S Compact Car',       ja: 'コンパクトカー', icon: 'S',   img: '/classes/compact-car.png' },
  { id: 'standard', code: 'G',   label: 'G Standard Car',      ja: '普通自動車',     icon: 'G',   img: '/classes/standard-car.png' },
  { id: 'suv',      code: 'SUV', label: 'SUV',                 ja: 'SUV',            icon: 'SUV', img: '/classes/suv.png' },
  { id: 'minivan',  code: 'F1',  label: 'F1 Minivan',          ja: 'ミニバン',       icon: 'F1',  img: '/classes/minivan-f1.png' },
  { id: 'luxury_minivan', code: 'F2', label: 'F2 Luxury Minivan', ja: '高級ミニバン', icon: 'F2', img: '/classes/luxury-minivan-f2.png' },
  { id: 'other',    code: 'V',   label: 'V Other Vehicles',    ja: 'その他・特殊車種', icon: 'V', img: '/classes/other-vehicles.png' },
];

export const SERVICE_TABS = [
  { id: 'corporate', label: '通常レンタカー', sub: 'Regular Car Rental', icon: '🚗' },
  { id: 'parking',   label: 'Parking Share', sub: 'Host Spaces',       icon: '🅿️' },
];

export const INIT_HERO_BANNERS = [
  { id: 'hero-banner-11', src: '/hero-banner-11.jpeg', alt: 'BEST Car Rental banner - Drive Your Journey Anywhere' },
  { id: 'hero-banner-22', src: '/hero-banner-22.jpeg', alt: 'BEST Car Rental banner - Global coverage and easy booking' },
  { id: 'hero-banner-33', src: '/hero-banner-33.jpeg', alt: 'BEST Car Rental banner - Japanese hospitality and support' },
];

// ── Default theme (White × Purple) ───────────────────────────────────────────
export const INIT_THEME = {
  // Brand colours
  primary:     '#7C3AED',   // purple-600
  accent:      '#a855f7',   // purple-500
  primaryDark: '#6D28D9',   // purple-700

  // Copy
  logoText:    'BEST Car Rental',
  heroTitle:   'Drive Your Journey',
  heroAccent:  'Anywhere.',
  heroSub:     'レンタカー · P2P カーシェア · おまかせ割引プラン — 一つのプラットフォームで完結',
  badge:       'グローバル展開中 — 50ヵ国以上で利用可能',
  searchBtn:   '空き車両を検索する',
  footerText:  '© 2025 Best Car Rental. All rights reserved.',
  // Surfaces (light theme)
  cardBg:      '#ffffff',
  headerBg:    '#ffffff',
  pageBg:      '#faf5ff',
};

// ── Vehicles ─────────────────────────────────────────────────────────────────
export const INIT_VEHICLES = [
  {
    id: 1, cls: 'kei', type: 'corporate',
    maker: 'Honda', model: 'N-BOX', year: 2023, grade: 'Custom Turbo',
    pax: 4, fuel: 'Gasoline', trans: 'AT',
    priceDay: 4500, priceHour: 650, deposit: 0, insurance: 1100,
    rating: 4.8, reviews: 124, loc: 'Shibuya, Tokyo',
    airports: ['HND', 'NRT'],
    img: 'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=400&q=80',
    badge: 'Best Value', badgeBg: '#10b981',
    tags: ['ETC', 'Free Cancel 7d'], status: 'active', oneWayEnabled: true,
  },
  {
    id: 2, cls: 'standard', type: 'corporate',
    maker: 'Toyota', model: 'Corolla', year: 2024, grade: 'Hybrid Z',
    pax: 5, fuel: 'Hybrid', trans: 'AT',
    priceDay: 7800, priceHour: 1100, deposit: 0, insurance: 1650,
    rating: 4.9, reviews: 287, loc: 'Shinjuku, Tokyo',
    airports: ['HND', 'NRT'],
    img: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?w=400&q=80',
    badge: 'Top Rated', badgeBg: '#f59e0b',
    tags: ['Hybrid', 'Child Seat', 'ETC'], status: 'active', oneWayEnabled: true,
  },
  {
    id: 3, cls: 'luxury_minivan', type: 'p2p',
    maker: 'Toyota', model: 'Alphard', year: 2023, grade: 'Executive Lounge',
    pax: 7, fuel: 'Hybrid', trans: 'AT',
    priceDay: 18000, priceHour: 2500, deposit: 30000, insurance: 2200,
    rating: 5.0, reviews: 56, loc: 'Roppongi, Tokyo',
    airports: ['HND', 'NRT'],
    img: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400&q=80',
    badge: 'Premium', badgeBg: '#8b5cf6',
    tags: ['P2P', 'Hybrid', '7 Seats'], status: 'active',
    holder: { name: 'K. Tanaka', av: 'KT', rating: 4.97, resp: '98%' },
  },
  {
    id: 4, cls: 'other', type: 'corporate',
    maker: 'Toyota', model: 'HiAce', year: 2022, grade: 'Grand Cabin',
    pax: 10, fuel: 'Diesel', trans: 'AT',
    priceDay: 22000, priceHour: 3200, deposit: 0, insurance: 2750,
    rating: 4.7, reviews: 33, loc: 'Haneda Airport',
    airports: ['HND', 'NRT'],
    img: 'https://images.unsplash.com/photo-1474978528675-4a50a4508dc8?w=400&q=80',
    badge: 'Airport Ready', badgeBg: '#0ea5e9',
    tags: ['10 Seats', 'Airport Pickup'], status: 'active', oneWayEnabled: true,
    // 跨区域送车（异地调车）デモ: 加盟店送車対象
    deliveryAvailable: true, deliveryFee: 6600, deliveryEtaHours: 6, oneWayReturn: true,
  },
  {
    id: 5, cls: 'suv', type: 'p2p',
    maker: 'Mazda', model: 'CX-5', year: 2023, grade: 'XD L Package',
    pax: 5, fuel: 'Diesel', trans: 'AT',
    priceDay: 9500, priceHour: 1400, deposit: 20000, insurance: 1650,
    rating: 4.8, reviews: 72, loc: 'Shibuya, Tokyo',
    airports: ['HND', 'NRT'],
    img: 'https://images.unsplash.com/photo-1493238792000-8113da705763?w=400&q=80',
    badge: null, tags: ['P2P', 'ETC', 'SUV'], status: 'active',
    holder: { name: 'Y. Suzuki', av: 'YS', rating: 4.88, resp: '95%' },
  },
  {
    id: 6, cls: 'kei', type: 'p2p',
    maker: 'Daihatsu', model: 'Tanto', year: 2023, grade: 'X',
    pax: 4, fuel: 'Gasoline', trans: 'CVT',
    priceDay: 3800, priceHour: 550, deposit: 0, insurance: 1100,
    rating: 4.6, reviews: 41, loc: 'Nakameguro',
    airports: ['HND', 'NRT'],
    img: 'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=400&q=80',
    badge: 'Budget Pick', badgeBg: '#14b8a6',
    tags: ['Child Seat', 'Compact'], status: 'active',
    holder: { name: 'M. Ito', av: 'MI', rating: 4.75, resp: '90%' },
  },
];

// ── Parking spots ────────────────────────────────────────────────────────────
export const INIT_PARKING = [
  {
    id: 'p1', name: 'Shibuya Center Parking',
    addr: '1-2-3 Shibuya, Shibuya-ku',
    priceHour: 500, priceDay: 3000,
    height: 2.1, width: 2.5, length: 5.0,
    available: 2, total: 5,
    img: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=400&q=80',
    rating: 4.5, reviews: 88, tags: ['24h', 'Security Cam'],
  },
  {
    id: 'p2', name: 'Shinjuku West Gate Lot',
    addr: '4-5 Nishi-Shinjuku',
    priceHour: 400, priceDay: 2500,
    height: 1.8, width: 2.3, length: 4.8,
    available: 1, total: 8,
    img: 'https://images.unsplash.com/photo-1470224114660-3f6686c562eb?w=400&q=80',
    rating: 4.3, reviews: 52, tags: ['Covered', 'EV Charger'],
  },
];

// ── Reservations ─────────────────────────────────────────────────────────────
export const INIT_RESERVATIONS = [
  {
    id: 'BCR-2025-0001', vehicleId: 2, userId: 1,
    pickup: '2025-06-10T10:00', ret: '2025-06-12T10:00',
    days: 2, total: 17280, status: 'confirmed',
    type: 'corporate', opts: { insurance: true, etc: true },
  },
  {
    id: 'BCR-2025-0002', vehicleId: 3, userId: 2,
    pickup: '2025-06-08T14:00', ret: '2025-06-08T20:00',
    days: 1, total: 15000, status: 'in_progress',
    type: 'p2p', opts: { insurance: true },
  },
  {
    id: 'BCR-2025-0003', vehicleId: 1, userId: 3,
    pickup: '2025-06-15T09:00', ret: '2025-06-16T09:00',
    days: 1, total: 5500, status: 'pending',
    type: 'corporate', opts: {},
  },
  {
    id: 'BCR-2025-0004', vehicleId: 5, userId: 1,
    pickup: '2025-05-20T10:00', ret: '2025-05-22T10:00',
    days: 2, total: 21780, status: 'completed',
    type: 'p2p', opts: { insurance: true, etc: true },
  },
];

// ── Users ────────────────────────────────────────────────────────────────────
export const INIT_USERS = [
  {
    id: 1, name: 'Kaku Admin', email: 'agentkaku0221@gmail.com',
    role: 'admin', phone: '+81-90-0000-0001',
    nat: 'JP', license: 'JP-12345678', count: 4, spent: 43780,
  },
  {
    id: 2, name: 'Yuki Tanaka', email: 'yuki@example.com',
    role: 'user', phone: '+81-90-1234-5678',
    nat: 'JP', license: 'JP-87654321', count: 2, spent: 15000,
  },
  {
    id: 3, name: 'Mike Chen', email: 'mike@example.com',
    role: 'user', phone: '+1-555-0123',
    nat: 'US', license: 'US-CA123456', count: 1, spent: 5500,
  },
];

// ── Cancellation policy calculator ──────────────────────────────────────────
export function calcCancelFee(baseAmt, pickupDateStr) {
  return calcCancelFeeForTime(baseAmt, pickupDateStr, new Date());
}

// ── Nationality / Country options ──────────────────────────────────────────────
// value は ISO 3166-1 alpha-2 国コード。多言語表示用に主要言語のラベルを保持。
export const COUNTRIES = [
  { code: 'JP', en: 'Japan',          ja: '日本',          zh: '日本',        ko: '일본',        flag: '🇯🇵' },
  { code: 'CN', en: 'China',          ja: '中国',          zh: '中国',        ko: '중국',        flag: '🇨🇳' },
  { code: 'TW', en: 'Taiwan',         ja: '台湾',          zh: '台湾',        ko: '대만',        flag: '🇹🇼' },
  { code: 'HK', en: 'Hong Kong',      ja: '香港',          zh: '香港',        ko: '홍콩',        flag: '🇭🇰' },
  { code: 'KR', en: 'South Korea',    ja: '韓国',          zh: '韩国',        ko: '대한민국',    flag: '🇰🇷' },
  { code: 'US', en: 'United States',  ja: 'アメリカ合衆国', zh: '美国',        ko: '미국',        flag: '🇺🇸' },
  { code: 'CA', en: 'Canada',         ja: 'カナダ',        zh: '加拿大',      ko: '캐나다',      flag: '🇨🇦' },
  { code: 'GB', en: 'United Kingdom', ja: 'イギリス',      zh: '英国',        ko: '영국',        flag: '🇬🇧' },
  { code: 'AU', en: 'Australia',      ja: 'オーストラリア', zh: '澳大利亚',    ko: '호주',        flag: '🇦🇺' },
  { code: 'NZ', en: 'New Zealand',    ja: 'ニュージーランド', zh: '新西兰',    ko: '뉴질랜드',    flag: '🇳🇿' },
  { code: 'SG', en: 'Singapore',      ja: 'シンガポール',   zh: '新加坡',      ko: '싱가포르',    flag: '🇸🇬' },
  { code: 'MY', en: 'Malaysia',       ja: 'マレーシア',     zh: '马来西亚',    ko: '말레이시아',  flag: '🇲🇾' },
  { code: 'TH', en: 'Thailand',       ja: 'タイ',          zh: '泰国',        ko: '태국',        flag: '🇹🇭' },
  { code: 'VN', en: 'Vietnam',        ja: 'ベトナム',       zh: '越南',        ko: '베트남',      flag: '🇻🇳' },
  { code: 'PH', en: 'Philippines',    ja: 'フィリピン',     zh: '菲律宾',      ko: '필리핀',      flag: '🇵🇭' },
  { code: 'ID', en: 'Indonesia',      ja: 'インドネシア',   zh: '印度尼西亚',  ko: '인도네시아',  flag: '🇮🇩' },
  { code: 'IN', en: 'India',          ja: 'インド',        zh: '印度',        ko: '인도',        flag: '🇮🇳' },
  { code: 'FR', en: 'France',         ja: 'フランス',       zh: '法国',        ko: '프랑스',      flag: '🇫🇷' },
  { code: 'DE', en: 'Germany',        ja: 'ドイツ',        zh: '德国',        ko: '독일',        flag: '🇩🇪' },
  { code: 'IT', en: 'Italy',          ja: 'イタリア',       zh: '意大利',      ko: '이탈리아',    flag: '🇮🇹' },
  { code: 'ES', en: 'Spain',          ja: 'スペイン',       zh: '西班牙',      ko: '스페인',      flag: '🇪🇸' },
  { code: 'CH', en: 'Switzerland',    ja: 'スイス',        zh: '瑞士',        ko: '스위스',      flag: '🇨🇭' },
  { code: 'NL', en: 'Netherlands',    ja: 'オランダ',       zh: '荷兰',        ko: '네덜란드',    flag: '🇳🇱' },
  { code: 'OTHER', en: 'Other',       ja: 'その他',        zh: '其他',        ko: '기타',        flag: '🌐' },
];

export function countryLabel(code, locale = 'en') {
  const c = COUNTRIES.find(x => x.code === code);
  if (!c) return code || '';
  const key = locale.startsWith('zh') ? 'zh' : (['ja', 'ko', 'en'].includes(locale) ? locale : 'en');
  return `${c.flag} ${c[key]}`;
}

// ── Legal / Contact pages (admin-editable, multilingual) ──────────────────────
// 管理者バックエンドで編集可能。各ページは言語ごとに本文を保持。
export const INIT_LEGAL_PAGES = {
  privacy: {
    en: 'BEST Car Rental respects your privacy. We collect only the information needed to process your booking (name, contact details, driver/IDP documents, payment). We never sell your data. Contact privacy@bestcarrental.example to request deletion.',
    ja: 'BEST Car Rental はお客様のプライバシーを尊重します。ご予約処理に必要な情報（氏名、連絡先、運転免許/IDP書類、決済情報）のみを取得します。データを第三者に販売することはありません。削除のご依頼は privacy@bestcarrental.example まで。',
    'zh-CN': 'BEST Car Rental 尊重您的隐私。我们仅收集处理预订所需的信息（姓名、联系方式、驾照/IDP 文件、支付信息），绝不出售您的数据。如需删除数据，请联系 privacy@bestcarrental.example。',
    'zh-TW': 'BEST Car Rental 尊重您的隱私。我們僅收集處理預訂所需的資訊（姓名、聯絡方式、駕照/IDP 文件、付款資訊），絕不出售您的資料。如需刪除資料，請聯絡 privacy@bestcarrental.example。',
    ko: 'BEST Car Rental은 고객의 개인정보를 존중합니다. 예약 처리에 필요한 정보(이름, 연락처, 운전면허/IDP 서류, 결제 정보)만 수집하며 데이터를 판매하지 않습니다. 삭제 요청은 privacy@bestcarrental.example로 문의하세요.',
  },
  terms: {
    en: 'By booking with BEST Car Rental you agree to these terms. A valid International Driving Permit (IDP) is required to drive in Japan. Refunds are not available for cancellations caused by failure to obtain a valid IDP or by an incomplete/invalid IDP at pickup. Cancellation fees: Free ≥7 days, 30% (6–2 days), 50% (1 day), 80% (same day).',
    ja: 'BEST Car Rental をご利用いただくことで本規約に同意したものとみなされます。日本での運転には有効な国際運転免許証（IDP）が必要です。IDPを取得できなかった場合、または受取時にIDPに不備があった場合のキャンセルは返金できません。キャンセル料：7日以上前まで無料、6〜2日前30%、1日前50%、当日80%。',
    'zh-CN': '使用 BEST Car Rental 即表示您同意本条款。在日本驾驶需持有有效的国际驾照（IDP）。因无法办理有效 IDP 或取车时 IDP 不齐全/无效导致的取消，恕不退款。取消费用：7天以上免费、6–2天 30%、1天 50%、当天 80%。',
    'zh-TW': '使用 BEST Car Rental 即表示您同意本條款。在日本駕駛需持有有效的國際駕照（IDP）。因無法取得有效 IDP 或取車時 IDP 不齊全/無效導致的取消，恕不退款。取消費用：7天以上免費、6–2天 30%、1天 50%、當天 80%。',
    ko: 'BEST Car Rental을 이용하면 본 약관에 동의하는 것으로 간주됩니다. 일본에서 운전하려면 유효한 국제운전면허(IDP)가 필요합니다. 유효한 IDP를 발급받지 못했거나 수령 시 IDP에 미비가 있어 발생한 취소는 환불되지 않습니다. 취소 수수료: 7일 이상 무료, 6–2일 30%, 1일 50%, 당일 80%.',
  },
  contact: {
    en: 'Customer support is available 24/7.\nEmail: support@bestcarrental.example\nPhone: +81-3-0000-0000\nLINE: @bestcarrental',
    ja: 'カスタマーサポートは24時間365日対応。\nメール: support@bestcarrental.example\n電話: +81-3-0000-0000\nLINE: @bestcarrental',
    'zh-CN': '客服全天候 24/7 服务。\n邮箱: support@bestcarrental.example\n电话: +81-3-0000-0000\nLINE: @bestcarrental',
    'zh-TW': '客服全天候 24/7 服務。\n電子郵件: support@bestcarrental.example\n電話: +81-3-0000-0000\nLINE: @bestcarrental',
    ko: '고객 지원은 연중무휴 24/7 제공됩니다.\n이메일: support@bestcarrental.example\n전화: +81-3-0000-0000\nLINE: @bestcarrental',
  },
};
