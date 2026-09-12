// ── Best Match（片道GO）— 回送車両マッチングの共通ロジック ──────────────────
// 乗り捨てられた車を、格安でユーザーに運転して戻してもらうためのモデル。
import { normalizeVehicleClass } from './runOfFleet.js';

// 一律デポジット（万一の乗り捨て・ペナルティ担保。満タン返却＆指定店舗返却で解放）
export const ONE_WAY_DEPOSIT = 50000;
// ガソリン未満タン時の代行手数料（デポジットから実費＋この手数料を徴収）
export const FUEL_REFUEL_FEE = 5000;

// サンプル拠点（実運用ではオーナー登録店舗に置き換え）
export const ONE_WAY_STORES = [
  { id: 'osaka',    name: '大阪店',   lat: 34.7025, lng: 135.4959 },
  { id: 'tokyo',    name: '東京店',   lat: 35.6812, lng: 139.7671 },
  { id: 'nagoya',   name: '名古屋店', lat: 35.1706, lng: 136.8816 },
  { id: 'fukuoka',  name: '福岡店',   lat: 33.5902, lng: 130.4207 },
  { id: 'sapporo',  name: '札幌店',   lat: 43.0687, lng: 141.3508 },
  { id: 'sendai',   name: '仙台店',   lat: 38.2601, lng: 140.8825 },
  { id: 'hiroshima',name: '広島店',   lat: 34.3975, lng: 132.4756 },
];

// 2点間の直線距離（km）— Haversine
export function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v == null || isNaN(v))) return 0;
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

// 距離から推奨返却期限を算出（時間）。平均60km/h + 12hバッファ、24h刻みで最低24h。
export function recommendedDeadlineHours(distanceKm) {
  const driveH = (Number(distanceKm) || 0) / 60;
  const raw = driveH + 12;
  return Math.max(24, Math.ceil(raw / 24) * 24);
}

// 推奨返却期限を ISO 文字列で返す
export function recommendedDeadlineISO(distanceKm, from = new Date()) {
  const h = recommendedDeadlineHours(distanceKm);
  return new Date(from.getTime() + h * 3600 * 1000).toISOString();
}

// 車種別の推奨基本料金係数（¥/km 目安。格安モデルなので低め。0円も可）
const CLASS_FACTOR = {
  kei: 3,
  compact: 3.5,
  standard: 4,
  suv: 5,
  minivan: 6,
  luxury_minivan: 7,
  other: 8,
  van: 8,
  large_van: 8,
};

// 距離と車種から推奨基本料金（100円単位、格安上限あり）。オーナーが微調整可。
export function recommendedBasePrice(cls, distanceKm) {
  const factor = CLASS_FACTOR[normalizeVehicleClass(cls)] ?? 4;
  const raw = (Number(distanceKm) || 0) * factor;
  // 「破格」を演出するため 1/3 に圧縮し、100円単位・上限8,800円・下限0円
  const price = Math.min(8800, Math.round((raw / 3) / 100) * 100);
  return Math.max(0, price);
}

// オーソリ（仮売上）金額の内訳。hold=与信確保額、capture=通常引き落とし額。
export function calcAuthorization({ base = 0, insurance = 0, deposit = ONE_WAY_DEPOSIT }) {
  const b = Math.max(0, Math.round(Number(base) || 0));
  const ins = Math.max(0, Math.round(Number(insurance) || 0));
  const dep = Math.max(0, Math.round(Number(deposit) || 0));
  return {
    base: b,
    insurance: ins,
    deposit: dep,
    captureTotal: b + ins,       // 満タン＆指定店舗返却で実際に引き落とす額
    holdTotal: b + ins + dep,    // カードに確保する与信枠
  };
}

// ピンのステータス（now=今すぐ予約可/赤, upcoming=募集開始予定/青）
export function pinStatus(listing, now = new Date()) {
  const from = listing?.availableFrom ?? listing?.available_from;
  if (from && new Date(from) > now) return 'upcoming';
  return 'now';
}

export const ONE_WAY_IN_TRANSIT_CUSTODY_STATUSES = new Set(['in_transit', 'handover_pending', 'pending_received']);

function listingCustodyStatus(listing) {
  return String(listing?.custodyStatus ?? listing?.custody_status ?? 'received').toLowerCase();
}

export function listingReadyForSearch(listing) {
  if (!listing) return false;
  if ((listing.status ?? 'open') !== 'open') return false;
  return !ONE_WAY_IN_TRANSIT_CUSTODY_STATUSES.has(listingCustodyStatus(listing));
}

export function listingReadyForReservation(listing) {
  return listingReadyForSearch(listing);
}

// 白×紫サイバー基調：now=濃い紫（今すぐ）/ upcoming=淡い紫（募集予定）
export const PIN_COLORS = { now: '#7c3aed', upcoming: '#c084fc' };

export const ROUTE_SEARCH_RADII_KM = [20, 50, 100];

export const ONE_WAY_AREA_PRESETS = [
  {
    id: 'kix', group: 'airport', lat: 34.4342, lng: 135.2441,
    labels: { en: 'Kansai Airport', ja: '関西空港', 'zh-CN': '关西机场', 'zh-TW': '關西機場', ko: '간사이공항' },
    aliases: ['kix', 'kansai airport', 'kansai international airport', '関空', '関西空港', '关西机场', '關西機場', '간사이공항'],
  },
  {
    id: 'itami', group: 'airport', lat: 34.7855, lng: 135.4382,
    labels: { en: 'Itami Airport', ja: '伊丹空港', 'zh-CN': '伊丹机场', 'zh-TW': '伊丹機場', ko: '이타미공항' },
    aliases: ['itami', 'itami airport', 'itm', '伊丹', '伊丹空港', '大阪空港', '伊丹机场', '伊丹機場', '이타미공항'],
  },
  {
    id: 'osaka-umeda', group: 'station', lat: 34.7025, lng: 135.4959,
    labels: { en: 'Osaka / Umeda', ja: '大阪・梅田', 'zh-CN': '大阪/梅田', 'zh-TW': '大阪/梅田', ko: '오사카/우메다' },
    aliases: ['osaka', 'osaka city', 'osaka downtown', 'umeda', '大阪', '大阪市', '大阪市内', '梅田', '大阪市区', '오사카', '우메다'],
  },
  {
    id: 'namba', group: 'station', lat: 34.6654, lng: 135.5019,
    labels: { en: 'Namba', ja: 'なんば', 'zh-CN': '难波', 'zh-TW': '難波', ko: '난바' },
    aliases: ['namba', 'nanba', 'なんば', '難波', '难波', '난바'],
  },
  {
    id: 'shin-osaka', group: 'station', lat: 34.7335, lng: 135.5002,
    labels: { en: 'Shin-Osaka', ja: '新大阪', 'zh-CN': '新大阪', 'zh-TW': '新大阪', ko: '신오사카' },
    aliases: ['shin-osaka', 'shin osaka', '新大阪', '신오사카'],
  },
  {
    id: 'kyoto-station', group: 'station', lat: 34.9858, lng: 135.7588,
    labels: { en: 'Kyoto Station', ja: '京都駅', 'zh-CN': '京都站', 'zh-TW': '京都站', ko: '교토역' },
    aliases: ['kyoto', 'kyoto station', 'kyoto city', '京都', '京都駅', '京都市内', '京都站', '교토', '교토역'],
  },
  {
    id: 'nara-station', group: 'station', lat: 34.6808, lng: 135.8189,
    labels: { en: 'Nara Station', ja: '奈良駅', 'zh-CN': '奈良站', 'zh-TW': '奈良站', ko: '나라역' },
    aliases: ['nara', 'nara station', '奈良', '奈良駅', '奈良市内', '奈良站', '나라', '나라역'],
  },
  {
    id: 'kobe-sannomiya', group: 'station', lat: 34.6948, lng: 135.1950,
    labels: { en: 'Kobe Sannomiya', ja: '神戸三宮', 'zh-CN': '神户三宫', 'zh-TW': '神戶三宮', ko: '고베 산노미야' },
    aliases: ['kobe', 'sannomiya', 'kobe sannomiya', '神戸', '三宮', '神戸三宮', '神户三宫', '神戶三宮', '고베', '산노미야'],
  },
  {
    id: 'usj', group: 'sightseeing', lat: 34.6654, lng: 135.4323,
    labels: { en: 'USJ', ja: 'USJ', 'zh-CN': '日本环球影城', 'zh-TW': '日本環球影城', ko: '유니버설 스튜디오 재팬' },
    aliases: ['usj', 'universal studios japan', 'ユニバ', '日本环球影城', '日本環球影城', '유니버설 스튜디오 재팬'],
  },
  {
    id: 'dotonbori', group: 'sightseeing', lat: 34.6687, lng: 135.5013,
    labels: { en: 'Dotonbori', ja: '道頓堀', 'zh-CN': '道顿堀', 'zh-TW': '道頓堀', ko: '도톤보리' },
    aliases: ['dotonbori', '道頓堀', '道顿堀', '도톤보리'],
  },
  {
    id: 'tokyo-station', group: 'station', lat: 35.6812, lng: 139.7671,
    labels: { en: 'Tokyo', ja: '東京', 'zh-CN': '东京', 'zh-TW': '東京', ko: '도쿄' },
    aliases: ['tokyo', 'tokyo station', 'tokyo city', '東京', '東京駅', '東京都', '东京', '도쿄'],
  },
  {
    id: 'narita-airport', group: 'airport', lat: 35.7720, lng: 140.3929,
    labels: { en: 'Narita Airport', ja: '成田空港', 'zh-CN': '成田机场', 'zh-TW': '成田機場', ko: '나리타공항' },
    aliases: ['nrt', 'narita', 'narita airport', 'narita international airport', '成田', '成田空港', '成田国際空港', '成田机场', '成田機場', '나리타', '나리타공항'],
  },
  {
    id: 'fukuoka-airport', group: 'airport', lat: 33.5857, lng: 130.4511,
    labels: { en: 'Fukuoka', ja: '福岡', 'zh-CN': '福冈', 'zh-TW': '福岡', ko: '후쿠오카' },
    aliases: ['fuk', 'fukuoka', 'fukuoka airport', 'hakata', '福岡', '福岡空港', '博多', '福冈', '福冈机场', '후쿠오카', '후쿠오카공항'],
  },
  {
    id: 'hokkaido-sapporo', group: 'airport', lat: 42.7750, lng: 141.6922,
    labels: { en: 'Hokkaido / Sapporo', ja: '北海道・札幌', 'zh-CN': '北海道/札幌', 'zh-TW': '北海道/札幌', ko: '홋카이도/삿포로' },
    aliases: ['cts', 'hokkaido', 'sapporo', 'new chitose', 'new chitose airport', '北海道', '札幌', '新千歳', '新千歳空港', '北海道机场', '홋카이도', '삿포로', '신치토세공항'],
  },
];

export function areaPresetLabel(preset, locale = 'en') {
  return preset?.labels?.[locale] ?? preset?.labels?.en ?? preset?.id ?? '';
}

export function normalizeAreaQuery(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[ー－‐-‒–—―]/g, '-')
    .replace(/\s+/g, '')
    .replace(/(付近|周辺|附近|周边|near|around|area|市内|市区)$/i, '');
}

export function resolveAreaPreset(query) {
  const needle = normalizeAreaQuery(query);
  if (!needle) return null;
  const rows = ONE_WAY_AREA_PRESETS.map(preset => ({
    preset,
    aliases: [preset.id, ...(preset.aliases ?? [])].map(normalizeAreaQuery).filter(Boolean),
  }));
  const exact = rows.find(row => row.aliases.some(alias => needle === alias));
  if (exact) {
    const { preset } = exact;
    return { id: preset.id, name: areaPresetLabel(preset, 'en'), lat: preset.lat, lng: preset.lng, preset };
  }
  for (const preset of ONE_WAY_AREA_PRESETS) {
    const aliases = [preset.id, ...(preset.aliases ?? [])].map(normalizeAreaQuery).filter(Boolean);
    if (aliases.some(alias => needle.length >= 3 && (needle.includes(alias) || alias.includes(needle)))) {
      return { id: preset.id, name: areaPresetLabel(preset, 'en'), lat: preset.lat, lng: preset.lng, preset };
    }
  }
  return null;
}

function pointDistanceKm(point, target) {
  if (!point || !target) return null;
  if ([point.lat, point.lng, target.lat, target.lng].some(v => v == null || isNaN(v))) return null;
  return haversineKm(Number(point.lat), Number(point.lng), Number(target.lat), Number(target.lng));
}

function withRouteScore(listing, pickupPoint, returnPoint) {
  const pickupDistanceKm = pointDistanceKm(listing.from, pickupPoint);
  const returnDistanceKm = pointDistanceKm(listing.to, returnPoint);
  const scoreKm = Number(pickupDistanceKm ?? 0) + Number(returnDistanceKm ?? 0);
  return {
    ...listing,
    routeSearch: {
      pickupDistanceKm,
      returnDistanceKm,
      scoreKm: Math.round(scoreKm * 10) / 10,
    },
  };
}

export function searchRouteListings(listings, { pickupPoint = null, returnPoint = null, radiiKm = ROUTE_SEARCH_RADII_KM } = {}) {
  const hasPickup = pickupPoint?.lat != null && pickupPoint?.lng != null;
  const hasReturn = returnPoint?.lat != null && returnPoint?.lng != null;
  const scored = (listings ?? []).map(listing => withRouteScore(listing, hasPickup ? pickupPoint : null, hasReturn ? returnPoint : null));
  if (!hasPickup && !hasReturn) {
    return { listings: scored, radiusKm: null, expanded: false };
  }

  const sorted = (items) => [...items].sort((a, b) =>
    (a.routeSearch?.scoreKm ?? 0) - (b.routeSearch?.scoreKm ?? 0) ||
    Number(a.basePrice ?? 0) - Number(b.basePrice ?? 0)
  );

  for (const radiusKm of radiiKm) {
    const matched = scored.filter(listing => {
      const p = listing.routeSearch?.pickupDistanceKm;
      const r = listing.routeSearch?.returnDistanceKm;
      return (!hasPickup || (p != null && p <= radiusKm)) && (!hasReturn || (r != null && r <= radiusKm));
    });
    if (matched.length > 0) {
      return { listings: sorted(matched), radiusKm, expanded: radiusKm !== radiiKm[0] };
    }
  }

  return { listings: [], radiusKm: radiiKm[radiiKm.length - 1] ?? null, expanded: true };
}

export function spreadRoutePoints(listings, side = 'from') {
  const groups = new Map();
  (listings ?? []).forEach(listing => {
    const point = listing?.[side];
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const rows = groups.get(key) ?? [];
    rows.push({ listing, point: { ...point, lat, lng } });
    groups.set(key, rows);
  });

  const out = {};
  groups.forEach(rows => {
    rows.forEach(({ listing, point }, index) => {
      if (rows.length === 1) {
        out[String(listing.id)] = point;
        return;
      }
      const angle = (Math.PI * 2 * index) / rows.length - Math.PI / 2;
      const ring = Math.floor(index / 8);
      const radius = 0.0017 + ring * 0.0008; // roughly 180m; enough to make stacked pins tappable.
      const lngScale = Math.max(0.25, Math.cos((point.lat * Math.PI) / 180));
      out[String(listing.id)] = {
        ...point,
        lat: point.lat + Math.sin(angle) * radius,
        lng: point.lng + (Math.cos(angle) * radius) / lngScale,
      };
    });
  });
  return out;
}

function dateAtStart(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateAtEnd(value) {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseListingDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function rentalDaysBetween(startValue, endValue, fallbackDays = 1) {
  const fallback = Math.max(1, Math.round(Number(fallbackDays) || 1));
  const start = parseListingDate(startValue);
  const end = parseListingDate(endValue);
  if (!start || !end || end <= start) return fallback;
  return Math.max(1, Math.ceil((end - start) / (1000 * 3600 * 24)));
}

export function routeRentalDays(search = {}, fallbackDays = 1) {
  return rentalDaysBetween(search.pickupDate, search.returnDate, fallbackDays);
}

export function routeRentalBaseAmount(listing, search = {}, fallbackDays = 1) {
  const dayRate = Number(
    listing?.priceDay ?? listing?.price_day ?? listing?.basePrice ?? listing?.base_price ?? 0,
  );
  return Math.max(0, Math.round(dayRate || 0)) * routeRentalDays(search, fallbackDays);
}

export function filterRouteSearchCandidates(listings, { selectedClass = 'all', pickupDate = '', returnDate = '' } = {}) {
  const start = dateAtStart(pickupDate || returnDate);
  const end = dateAtEnd(returnDate || pickupDate);
  return (listings ?? []).filter(listing => {
    if (selectedClass && selectedClass !== 'all' && normalizeVehicleClass(listing?.cls) !== normalizeVehicleClass(selectedClass)) return false;
    if (!start || !end) return true;

    const availableFrom = parseListingDate(listing?.availableFrom ?? listing?.available_from);
    const deadlineAt = parseListingDate(listing?.deadlineAt ?? listing?.deadline_at);
    if (availableFrom && availableFrom > end) return false;
    if (deadlineAt && deadlineAt < start) return false;
    return true;
  });
}

// DBの行 → フロント用オブジェクト（camelCase）
export function dbToListing(r) {
  if (!r) return null;
  return {
    id: r.id,
    ownerId: r.owner_id ?? null,
    vehicleId: r.vehicle_id ?? null,
    maker: r.maker ?? '', model: r.model ?? '', cls: r.cls ?? 'standard',
    img: r.img_url ?? '',
    from: { name: r.from_name, lat: Number(r.from_lat), lng: Number(r.from_lng) },
    to:   { name: r.to_name,   lat: Number(r.to_lat),   lng: Number(r.to_lng) },
    distanceKm: Number(r.distance_km ?? 0),
    basePrice: Number(r.base_price ?? 0),
    deadlineAt: r.deadline_at,
    availableFrom: r.available_from,
    custodyStatus: r.custody_status ?? 'received',
    homeOwnerId: r.home_owner_id ?? null,
    currentOwnerId: r.current_owner_id ?? null,
    routePolicy: r.route_policy ?? null,
    sourceCrossReturnId: r.source_cross_return_id ?? null,
    serviceOwnerId: r.service_owner_id ?? null,
    serviceFeeTotal: Number(r.service_fee_total ?? 0),
    insurancePlans: r.insurance_plans ?? null,
    status: r.status ?? 'open',
    reservationId: r.reservation_id ?? null,
  };
}
