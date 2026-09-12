export const BOOKING_TYPES = Object.freeze({
  SPECIFIC: 'specific',
  CLASS_BASED: 'class_based',
});

export const ASSIGNMENT_STATUS = Object.freeze({
  ASSIGNED: 'assigned',
  PENDING_ASSIGNMENT: 'pending_assignment',
});

export const VEHICLE_CLASS_ORDER = ['kei', 'compact', 'standard', 'suv', 'minivan', 'luxury_minivan', 'other'];

const VEHICLE_CLASS_ALIASES = Object.freeze({
  k: 'kei',
  kei_car: 'kei',
  light: 'kei',
  light_car: 'kei',
  s: 'compact',
  compact_car: 'compact',
  g: 'standard',
  standard_car: 'standard',
  ordinary_car: 'standard',
  normal_car: 'standard',
  f1: 'minivan',
  mpv: 'minivan',
  f2: 'luxury_minivan',
  luxury_mpv: 'luxury_minivan',
  v: 'other',
  other_vehicle: 'other',
  other_vehicles: 'other',
  special_vehicle: 'other',
  special_vehicles: 'other',
  van: 'other',
  large_van: 'other',
  convertible: 'other',
});

const LEGACY_CLASS_IMAGE_PATHS = new Set([
  '/run-of-fleet/kei-car.jpeg',
  '/run-of-fleet/compact-car.jpeg',
  '/run-of-fleet/standard-car.jpeg',
  '/run-of-fleet/minivan.jpeg',
  '/run-of-fleet/luxury-minivan.jpeg',
  '/run-of-fleet/van.jpeg',
]);

export const RUN_OF_FLEET_CLASS_ASSETS = Object.freeze({
  kei: {
    label: 'K Kei Car',
    labelJa: '軽自動車',
    image: '/classes/kei-car.png',
    seats: '最大4名',
  },
  compact: {
    label: 'S Compact Car',
    labelJa: 'コンパクトカー',
    image: '/classes/compact-car.png',
    seats: '最大5名',
  },
  standard: {
    label: 'G Standard Car',
    labelJa: '普通自動車',
    image: '/classes/standard-car.png',
    seats: '最大5名',
  },
  suv: {
    label: 'SUV',
    labelJa: 'SUV',
    image: '/classes/suv.png',
    seats: '最大5名',
  },
  minivan: {
    label: 'F1 Minivan',
    labelJa: 'ミニバン',
    image: '/classes/minivan-f1.png',
    seats: '6-8名',
  },
  luxury_minivan: {
    label: 'F2 Luxury Minivan',
    labelJa: '高級ミニバン',
    image: '/classes/luxury-minivan-f2.png',
    seats: '7-8名',
  },
  other: {
    label: 'V Other Vehicles',
    labelJa: 'その他・特殊車種',
    image: '/classes/other-vehicles.png',
    seats: '車種により異なります',
  },
});

export const RUN_OF_FLEET_CLASS_OPTIONS = Object.freeze(
  VEHICLE_CLASS_ORDER.map(id => ({
    id,
    ...RUN_OF_FLEET_CLASS_ASSETS[id],
  })),
);

const CLOSED_STATUSES = new Set(['cancelled', 'canceled', 'rejected']);

export function normalizeVehicleClass(value) {
  const normalized = String(value ?? 'standard')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  return VEHICLE_CLASS_ALIASES[normalized] ?? normalized;
}

export function classLabel(value) {
  const normalized = normalizeVehicleClass(value);
  return RUN_OF_FLEET_CLASS_ASSETS[normalized]?.label ?? normalized;
}

export function classLabelJa(value) {
  const normalized = normalizeVehicleClass(value);
  return RUN_OF_FLEET_CLASS_ASSETS[normalized]?.labelJa ?? normalized;
}

export function upgradeClassesFor(targetClass) {
  const normalized = normalizeVehicleClass(targetClass);
  const idx = VEHICLE_CLASS_ORDER.indexOf(normalized);
  if (idx < 0) return [normalized];
  return VEHICLE_CLASS_ORDER.slice(idx);
}

export function overlapsRange(reservation, pickup, ret) {
  const pickupAt = reservation.pickup_at ?? reservation.pickup;
  const returnAt = reservation.return_at ?? reservation.ret;
  if (!pickupAt || !returnAt || !pickup || !ret) return false;
  return new Date(pickupAt) < new Date(ret) && new Date(returnAt) > new Date(pickup);
}

export function isOpenReservation(reservation) {
  return !CLOSED_STATUSES.has(String(reservation.status ?? '').toLowerCase());
}

export function vehicleIdOf(reservation) {
  return reservation.vehicle_id ?? reservation.vehicleId ?? null;
}

export function ownerIdOf(row) {
  return row.owner_id ?? row.ownerId ?? row.owner_auth_id ?? row.ownerAuthId ?? null;
}

export function targetClassOf(row) {
  return normalizeVehicleClass(row.target_class ?? row.targetClass ?? row.cls);
}

export function runOfFleetConfigOf(vehicle) {
  const config = vehicle?.holder?.runOfFleet ?? vehicle?.holder?.run_of_fleet ?? vehicle?.runOfFleet ?? vehicle?.run_of_fleet ?? {};
  const enabled = Boolean(config.enabled);
  const targetClass = normalizeVehicleClass(config.class ?? config.targetClass ?? config.target_class ?? vehicle?.cls);
  const asset = RUN_OF_FLEET_CLASS_ASSETS[targetClass] ?? RUN_OF_FLEET_CLASS_ASSETS.standard;
  const configuredImage = config.image ?? config.imageUrl ?? config.image_url;
  return {
    enabled,
    targetClass,
    priceDay: Number(config.priceDay ?? config.price_day ?? vehicle?.price_day ?? vehicle?.priceDay ?? 0),
    location: String(config.location ?? vehicle?.loc ?? '').trim(),
    image: configuredImage && !LEGACY_CLASS_IMAGE_PATHS.has(configuredImage) ? configuredImage : asset.image,
  };
}

function isRunOfFleetVehicle(v, ownerId, targetClass) {
  const vehicleOwnerId = ownerIdOf(v);
  const approvalStatus = v.approval_status ?? v.approvalStatus ?? 'approved';
  const status = v.status ?? 'active';
  const booth = runOfFleetConfigOf(v);
  return String(vehicleOwnerId) === String(ownerId)
    && booth.enabled
    && booth.targetClass === normalizeVehicleClass(targetClass)
    && status !== 'maintenance'
    && approvalStatus === 'approved';
}

export function isClassBasedReservation(reservation) {
  return (reservation.booking_type ?? reservation.bookingType) === BOOKING_TYPES.CLASS_BASED
    || (!vehicleIdOf(reservation) && Boolean(reservation.target_class ?? reservation.targetClass));
}

export function isSpecificVehicleAvailable({ vehicleId, reservations, pickup, ret, excludeReservationId = null }) {
  return !(reservations ?? []).some(r => {
    if (excludeReservationId && r.id === excludeReservationId) return false;
    return isOpenReservation(r)
      && String(vehicleIdOf(r)) === String(vehicleId)
      && overlapsRange(r, pickup, ret);
  });
}

export function calculateClassAvailability({
  vehicles,
  reservations,
  ownerId,
  targetClass,
  pickup,
  ret,
  location = '',
  allowUpgrades = false,
}) {
  const classes = allowUpgrades ? upgradeClassesFor(targetClass) : [normalizeVehicleClass(targetClass)];
  const fleet = (vehicles ?? []).filter(v => {
    const booth = runOfFleetConfigOf(v);
    return booth.enabled && classes.some(cls => isRunOfFleetVehicle(v, ownerId, cls));
  });
  const fleetIds = new Set(fleet.map(v => String(v.id)));
  const overlapping = (reservations ?? []).filter(r => {
    if (!isOpenReservation(r) || !overlapsRange(r, pickup, ret)) return false;
    const reservationOwnerId = ownerIdOf(r);
    const belongsToFleetVehicle = fleetIds.has(String(vehicleIdOf(r)));
    const belongsToClassBucket = String(reservationOwnerId) === String(ownerId)
      && isClassBasedReservation(r)
      && normalizeVehicleClass(r.target_class ?? r.targetClass) === normalizeVehicleClass(targetClass);
    const reservationLocation = String(r.pickup_loc ?? r.pickupLoc ?? '').trim();
    const sameLocation = !location || !reservationLocation || reservationLocation === String(location).trim();
    return belongsToFleetVehicle || (belongsToClassBucket && sameLocation);
  });

  const specificBookedVehicleIds = new Set(
    overlapping.map(vehicleIdOf).filter(Boolean).map(id => String(id)),
  );
  const classBookedCount = overlapping.filter(r => isClassBasedReservation(r)).length;
  const availableCount = Math.max(0, fleet.length - specificBookedVehicleIds.size - classBookedCount);

  return {
    ownerId,
    targetClass: normalizeVehicleClass(targetClass),
    totalVehicles: fleet.length,
    specificBookedCount: specificBookedVehicleIds.size,
    classBookedCount,
    availableCount,
  };
}

export function buildReservationPayload({
  id,
  vehicle,
  ownerId,
  userId,
  pickup,
  ret,
  days,
  total,
  type,
  opts,
  pickupLoc,
  retLoc,
  guestName,
  guestEmail,
  guestPhone,
  guestBookingToken,
  contactHandles,
  idpFileName,
  idpExpiresOn,
  oneWayLocationId,
  oneWayFee,
  stripePaymentIntentId,
  status,
}) {
  const bookingType = vehicle?.listingType === BOOKING_TYPES.CLASS_BASED
    ? BOOKING_TYPES.CLASS_BASED
    : BOOKING_TYPES.SPECIFIC;
  const targetClass = normalizeVehicleClass(vehicle?.targetClass ?? vehicle?.cls);
  const assignmentStatus = bookingType === BOOKING_TYPES.CLASS_BASED
    ? ASSIGNMENT_STATUS.PENDING_ASSIGNMENT
    : ASSIGNMENT_STATUS.ASSIGNED;

  return {
    id,
    vehicleId: bookingType === BOOKING_TYPES.CLASS_BASED ? null : vehicle?.id,
    ownerId: ownerId ?? ownerIdOf(vehicle) ?? null,
    userId: userId ?? null,
    pickup,
    ret,
    days,
    total,
    status: status ?? assignmentStatus,
    type: type ?? vehicle?.type ?? 'corporate',
    opts: opts ?? {},
    pickupLoc: pickupLoc ?? '',
    retLoc: retLoc ?? '',
    guestName: guestName ?? '',
    guestEmail: guestEmail ?? '',
    guestPhone: guestPhone ?? '',
    guestBookingToken: guestBookingToken ?? null,
    contactHandles: contactHandles ?? {},
    idpFileName: idpFileName ?? null,
    idpExpiresOn: idpExpiresOn ?? null,
    oneWayLocationId: oneWayLocationId ?? null,
    oneWayFee: oneWayFee ?? 0,
    stripePaymentIntentId: stripePaymentIntentId ?? null,
    bookingType,
    targetClass,
    assignmentStatus,
  };
}

export function buildClassVirtualListings({
  vehicles,
  reservations,
  owners = [],
  pickup,
  ret,
  selectedClass = 'all',
  airportCode = '',
}) {
  const ownerMap = new Map((owners ?? []).map(o => [String(o.id), o]));
  const runOfFleetInventoryVehicles = (vehicles ?? []).filter(v => {
    const approvalStatus = v.approval_status ?? v.approvalStatus ?? 'approved';
    if ((v.status ?? 'active') === 'maintenance' || approvalStatus !== 'approved') return false;
    if ((v.type ?? 'corporate') !== 'corporate') return false;
    if (airportCode && !(Array.isArray(v.airports) && v.airports.includes(airportCode))) return false;
    const booth = runOfFleetConfigOf(v);
    return Boolean(ownerIdOf(v)) && booth.enabled && booth.location;
  });

  const groups = new Map();
  runOfFleetInventoryVehicles.forEach(v => {
    const booth = runOfFleetConfigOf(v);
    const cls = booth.targetClass;
    if (selectedClass !== 'all' && cls !== normalizeVehicleClass(selectedClass)) return;
    const key = `${ownerIdOf(v)}:${cls}:${booth.location}:${booth.priceDay}:${booth.image}`;
    const current = groups.get(key) ?? [];
    groups.set(key, [...current, v]);
  });

  return [...groups.entries()].map(([key, group]) => {
    const [ownerId, targetClass] = key.split(':');
    const booth = runOfFleetConfigOf(group[0]);
    const inventory = calculateClassAvailability({
      vehicles: runOfFleetInventoryVehicles,
      reservations,
      ownerId,
      targetClass,
      pickup,
      ret,
      location: booth.location,
    });
    if (inventory.availableCount <= 0) return null;
    const representative = [...group].sort((a, b) => Number(a.price_day ?? a.priceDay ?? 0) - Number(b.price_day ?? b.priceDay ?? 0))[0];
    const basePrice = Number(representative.price_day ?? representative.priceDay ?? 0);
    const owner = ownerMap.get(String(ownerId));
    return {
      ...representative,
      id: `rof-${ownerId}-${targetClass}`,
      listingType: BOOKING_TYPES.CLASS_BASED,
      bookingType: BOOKING_TYPES.CLASS_BASED,
      vehicleId: null,
      targetClass,
      cls: targetClass,
      maker: owner?.store_name ?? booth.location ?? representative.loc?.split(',')[0] ?? 'Store',
      model: `${classLabelJa(targetClass)} お任せ`,
      grade: 'Vehicle assigned before pickup',
      year: null,
      img: booth.image,
      img_url: booth.image,
      loc: booth.location,
      priceDay: Math.max(0, booth.priceDay),
      price_day: Math.max(0, booth.priceDay),
      originalPriceDay: basePrice,
      classAvailable: inventory.availableCount,
      fleetTotal: inventory.totalVehicles,
      ownerId,
      owner_id: ownerId,
      badge: 'Run-of-fleet',
      badgeBg: '#7c3aed',
      tags: [classLabelJa(targetClass), booth.location, `空き${inventory.availableCount}台`],
    };
  }).filter(Boolean);
}
