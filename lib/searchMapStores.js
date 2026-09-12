import { BOOKING_TYPES, classLabelJa, normalizeVehicleClass, ownerIdOf } from './runOfFleet.js';

const normalizeText = (value) => String(value ?? '').trim();

function slugPart(value, fallback) {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function isClassBasedListing(listing) {
  return (listing?.listingType ?? listing?.bookingType) === BOOKING_TYPES.CLASS_BASED;
}

function ownerIsApproved(owner) {
  return String(owner?.status ?? 'approved') === 'approved';
}

function buildOwnerMap(owners) {
  const ownerMap = new Map();
  (owners ?? []).filter(ownerIsApproved).forEach(owner => {
    [owner?.id, owner?.user_id, owner?.userId].filter(Boolean).forEach(id => {
      const key = String(id);
      if (!ownerMap.has(key)) ownerMap.set(key, owner);
    });
  });
  return ownerMap;
}

function ownerForListing(listing, ownerMap) {
  const ids = [
    listing?.owner_id,
    listing?.ownerId,
    listing?.owner_auth_id,
    listing?.ownerAuthId,
  ].filter(Boolean);
  return ids.map(id => ownerMap.get(String(id))).find(Boolean) ?? null;
}

function listingStoreName(listing, owner = null) {
  const candidates = [
    owner?.storeName,
    owner?.store_name,
    listing?.storeName,
    listing?.store_name,
    listing?.holder?.name,
    isClassBasedListing(listing) ? listing?.maker : '',
    listing?.ownerName,
    listing?.owner_name,
  ];
  return candidates.map(normalizeText).find(Boolean) || normalizeText(listing?.loc)?.split(',')[0] || 'Store';
}

function listingStoreLocation(listing, owner = null) {
  return normalizeText(
    owner?.storeLocation ??
    owner?.store_location ??
    listing?.storeLocation ??
    listing?.store_location ??
    listing?.loc
  );
}

function listingClass(listing) {
  return normalizeVehicleClass(listing?.targetClass ?? listing?.target_class ?? listing?.cls);
}

function coordsFor(listing, coordsById) {
  const coords = coordsById?.[String(listing?.id)];
  if (Array.isArray(coords) && coords.length >= 2) return [Number(coords[0]), Number(coords[1])];
  if (listing?.lat != null && listing?.lng != null) return [Number(listing.lat), Number(listing.lng)];
  return null;
}

function averageCoords(coords) {
  const valid = coords.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, [lat, lng]) => ({ lat: sum.lat + lat, lng: sum.lng + lng }), { lat: 0, lng: 0 });
  return [total.lat / valid.length, total.lng / valid.length];
}

export function buildStoreMapGroups({ listings, coordsById = {}, owners = [] } = {}) {
  const groups = new Map();
  const ownerMap = buildOwnerMap(owners);

  (listings ?? []).forEach(listing => {
    const coords = coordsFor(listing, coordsById);
    if (!coords) return;

    const owner = ownerForListing(listing, ownerMap);
    const ownerId = owner?.id ?? ownerIdOf(listing) ?? 'public';
    const storeName = listingStoreName(listing, owner);
    const location = listingStoreLocation(listing, owner);
    const key = `${ownerId}:${location || storeName}`;
    const current = groups.get(key) ?? {
      id: `store-${slugPart(ownerId, 'public')}-${slugPart(location || storeName, 'location')}`,
      ownerId,
      name: storeName,
      location,
      listings: [],
      coordsList: [],
    };

    groups.set(key, {
      ...current,
      listings: [...current.listings, listing],
      coordsList: [...current.coordsList, coords],
    });
  });

  return [...groups.values()].map(group => {
    const listingsSorted = [...group.listings].sort((a, b) => {
      const typeA = isClassBasedListing(a) ? 0 : 1;
      const typeB = isClassBasedListing(b) ? 0 : 1;
      if (typeA !== typeB) return typeA - typeB;
      return Number(a.priceDay ?? a.price_day ?? 0) - Number(b.priceDay ?? b.price_day ?? 0);
    });
    const coords = averageCoords(group.coordsList);
    const classPlanCount = listingsSorted.filter(isClassBasedListing).length;
    const classAvailable = listingsSorted.reduce((sum, listing) => (
      sum + (isClassBasedListing(listing) ? Number(listing.classAvailable ?? 0) : 0)
    ), 0);
    const classes = [...new Set(listingsSorted.map(listingClass).filter(Boolean))];
    const minPriceDay = Math.min(...listingsSorted.map(v => Number(v.priceDay ?? v.price_day ?? 0)).filter(Number.isFinite));

    return {
      id: group.id,
      ownerId: group.ownerId,
      name: group.name,
      location: group.location,
      coords,
      listings: listingsSorted,
      listingCount: listingsSorted.length,
      specificCount: listingsSorted.length - classPlanCount,
      classPlanCount,
      classAvailable,
      classes,
      classLabels: classes.map(classLabelJa),
      minPriceDay: Number.isFinite(minPriceDay) ? minPriceDay : 0,
      markerLabel: String(listingsSorted.length),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.location.localeCompare(b.location, 'ja'));
}
