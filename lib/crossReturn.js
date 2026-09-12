import { haversineKm } from './oneWay.js';

export function crossReturnModeRequiresOwnerId(mode) {
  return mode !== 'public-listings';
}

const toNumberOrNull = (value) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function draftNumberInputValue(value, fallback) {
  return value === '' ? '' : (value ?? fallback);
}

export function coerceExpectedStorageDays(value) {
  return Math.max(1, Math.round(Number(value) || 1));
}

export function coerceCrossReturnBaseFee(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function computeCrossReturnCustomerFee(config = {}, reservationTotal = 0) {
  const baseFee = coerceCrossReturnBaseFee(config.baseFee ?? config.base_fee);
  const hasExpectedDays = config.expectedDays != null || config.expected_days != null;
  const rawDays = hasExpectedDays ? (config.expectedDays ?? config.expected_days) : (config.daysStored ?? config.days_stored);
  const storageDays = hasExpectedDays
    ? coerceExpectedStorageDays(rawDays)
    : Math.max(0, Math.round(Number(rawDays) || 0));
  const receiverFee = (() => {
    if (config.feeMode === 'storage' || config.fee_mode === 'storage') {
      return Math.max(0, Math.round((Number(config.storagePerDay ?? config.storage_per_day) || 0) * storageDays));
    }
    if ((config.splitType ?? config.split_type) === 'fixed') {
      return Math.max(0, Math.round(Number(config.splitValue ?? config.split_value) || 0));
    }
    return Math.max(0, Math.round(((Number(reservationTotal) || 0) * (Number(config.splitValue ?? config.split_value) || 0)) / 100));
  })();
  return {
    baseFee,
    receiverFee,
    total: baseFee + receiverFee,
  };
}

export const CROSS_RETURN_IN_TRANSIT_STATUSES = new Set(['requested', 'accepted']);
export const CROSS_RETURN_RECEIVED_STATUSES = new Set(['received', 'settled']);
export const HOME_RETURN_REQUEST_STATUSES = new Set(['staff_requested', 'one_way_requested']);
export const HOME_RETURN_BUSY_STATUSES = new Set(['staff_requested', 'one_way_requested', 'staff_returning', 'one_way_listed', 'one_way_booked', 'one_way_returning']);

function ownerIdOf(value) {
  return value == null || value === '' ? null : String(value);
}

function homeOwnerIdOf(vehicle = {}, latestTransfer = null) {
  return ownerIdOf(
    vehicle.owner_id ?? vehicle.ownerId ?? vehicle.owner_auth_id ?? vehicle.ownerAuthId ?? latestTransfer?.origin_owner_id,
  );
}

export function homeReturnStatusOf(value = {}) {
  return String(value?.homeReturnStatus ?? value?.home_return_status ?? 'holding').toLowerCase();
}

export const BEST_GO_WORKFLOW_STEPS = [
  { key: 'departure_photos', labelKey: 'cr_flowDeparturePhotos' },
  { key: 'arrival_inspection', labelKey: 'cr_flowArrivalInspection' },
  { key: 'return_request', labelKey: 'cr_flowReturnRequest' },
  { key: 'receiver_acceptance', labelKey: 'cr_flowReceiverAcceptance' },
  { key: 'one_way_public', labelKey: 'cr_flowOneWayPublic' },
  { key: 'one_way_reserved', labelKey: 'cr_flowOneWayReserved' },
  { key: 'moving_home', labelKey: 'cr_flowMovingHome' },
  { key: 'home_inspection', labelKey: 'cr_flowHomeInspection' },
  { key: 'normal_public', labelKey: 'cr_flowNormalPublic' },
];

export function bestGoWorkflowState(job = {}) {
  const status = String(job?.status ?? '').toLowerCase();
  const homeStatus = homeReturnStatusOf(job);

  if (status === 'settled') {
    return { activeStep: 'normal_public', statusKey: 'cr_flowStatusNormalPublic' };
  }
  if (status === 'cancelled') {
    return { activeStep: 'return_request', statusKey: 'cr_flowStatusCancelled' };
  }
  if (homeStatus === 'returned_home') {
    return { activeStep: 'home_inspection', statusKey: 'cr_flowStatusHomeCheck' };
  }
  if (homeStatus === 'one_way_returning' || homeStatus === 'staff_returning') {
    return { activeStep: 'moving_home', statusKey: 'cr_flowStatusMoving' };
  }
  if (homeStatus === 'one_way_booked') {
    return { activeStep: 'one_way_reserved', statusKey: 'cr_flowStatusReserved' };
  }
  if (homeStatus === 'one_way_listed') {
    return { activeStep: 'one_way_public', statusKey: 'cr_flowStatusPublic' };
  }
  if (HOME_RETURN_REQUEST_STATUSES.has(homeStatus)) {
    return { activeStep: 'receiver_acceptance', statusKey: 'cr_flowStatusWaitingApproval' };
  }
  if (status === 'received') {
    return { activeStep: 'return_request', statusKey: 'cr_flowStatusReturnRequest' };
  }
  if (CROSS_RETURN_IN_TRANSIT_STATUSES.has(status)) {
    return { activeStep: 'arrival_inspection', statusKey: 'cr_flowStatusArrivalCheck' };
  }
  return { activeStep: 'departure_photos', statusKey: 'cr_flowStatusDepartureShare' };
}

export function bestGoInspectionKey({ reservationId, crossReturnId, leg = 'outbound' } = {}) {
  if (!reservationId || !crossReturnId) return null;
  return `${reservationId}:best-go:${crossReturnId}:${leg}`;
}

function hasPhotoValue(value) {
  return value != null && value !== '';
}

function hasInspectionPhotos(inspection) {
  return Object.values(inspection?.photos ?? {}).some(photo =>
    hasPhotoValue(photo?.before) || hasPhotoValue(photo?.after),
  );
}

function outboundInspectionWithReservationBefore({ reservationInspection, outboundInspection, outboundInspectionId }) {
  const reservationPhotos = reservationInspection?.photos ?? {};
  const outboundPhotos = outboundInspection?.photos ?? {};
  const mergedPhotos = {};
  const ids = new Set([...Object.keys(reservationPhotos), ...Object.keys(outboundPhotos)]);

  ids.forEach(id => {
    const fromReservation = reservationPhotos[id] ?? {};
    const fromOutbound = outboundPhotos[id] ?? {};
    const merged = { ...fromOutbound };
    if (!hasPhotoValue(merged.before) && hasPhotoValue(fromReservation.before)) {
      merged.before = fromReservation.before;
    }
    if (hasPhotoValue(merged.before) || hasPhotoValue(merged.after)) {
      mergedPhotos[id] = merged;
    }
  });

  const inspection = {
    ...(outboundInspection ?? {}),
    id: outboundInspection?.id ?? outboundInspectionId ?? null,
    leg: 'outbound',
    photos: mergedPhotos,
    estCost: outboundInspection?.estCost ?? 0,
    analysis: outboundInspection?.analysis ?? null,
    mode: outboundInspection?.mode ?? null,
  };

  return hasInspectionPhotos(inspection) ? inspection : null;
}

export function composeBestGoSharedInspections({
  reservationInspection = null,
  outboundInspection = null,
  homewardInspection = null,
  outboundInspectionId = null,
} = {}) {
  return [
    outboundInspectionWithReservationBefore({ reservationInspection, outboundInspection, outboundInspectionId }),
    homewardInspection,
  ].filter(Boolean);
}

export function bestGoInspectionAction(job = {}) {
  const reservationId = job?.reservationId ?? job?.reservation_id;
  const crossReturnId = job?.id ?? job?.crossReturnId ?? job?.cross_return_id;
  const role = String(job?.role ?? '').toLowerCase();
  const status = String(job?.status ?? '').toLowerCase();
  const homeStatus = homeReturnStatusOf(job);

  if (!reservationId || !crossReturnId) return null;

  if (role === 'receiving' && status === 'received' && ['holding', 'undecided', 'staff_requested', 'one_way_requested'].includes(homeStatus)) {
    return {
      inspectionId: bestGoInspectionKey({ reservationId, crossReturnId, leg: 'outbound' }),
      phase: 'after',
      buttonKey: 'cr_inspectionOutboundArrivalButton',
      titleKey: 'cr_inspectionOutboundTitle',
      hintKey: 'cr_inspectionArrivalHint',
    };
  }

  if (role === 'receiving' && status === 'received' && ['staff_returning', 'one_way_listed', 'one_way_booked', 'one_way_returning'].includes(homeStatus)) {
    return {
      inspectionId: bestGoInspectionKey({ reservationId, crossReturnId, leg: 'homeward' }),
      phase: 'before',
      buttonKey: 'cr_inspectionHomewardDepartureButton',
      titleKey: 'cr_inspectionHomewardTitle',
      hintKey: 'cr_inspectionHomewardDepartureHint',
    };
  }

  if (role === 'origin' && ['staff_returning', 'one_way_returning', 'returned_home'].includes(homeStatus)) {
    return {
      inspectionId: bestGoInspectionKey({ reservationId, crossReturnId, leg: 'homeward' }),
      phase: 'after',
      buttonKey: 'cr_inspectionHomewardArrivalButton',
      titleKey: 'cr_inspectionHomewardTitle',
      hintKey: 'cr_inspectionArrivalHint',
    };
  }

  return null;
}

export function homeReturnPhase(job = {}) {
  const status = String(job?.status ?? '').toLowerCase();
  const role = String(job?.role ?? '').toLowerCase();
  const homeStatus = homeReturnStatusOf(job);

  if (status === 'cancelled') return 'cancelled';
  if (homeStatus === 'returned_home') return 'returned_home';
  if (HOME_RETURN_REQUEST_STATUSES.has(homeStatus)) return 'return_requested';
  if (homeStatus === 'staff_returning') return 'staff_returning';
  if (['one_way_listed', 'one_way_booked', 'one_way_returning'].includes(homeStatus)) return 'one_way_returning';
  if (status === 'settled') return 'settlement_done';
  if (role === 'receiving' && CROSS_RETURN_IN_TRANSIT_STATUSES.has(status)) return 'incoming_scheduled';
  if (role === 'receiving' && CROSS_RETURN_RECEIVED_STATUSES.has(status)) return 'holding_other_vehicle';
  if (role === 'origin' && CROSS_RETURN_RECEIVED_STATUSES.has(status)) return 'awaiting_return_request';
  return 'other';
}

export function groupCrossReturnJobs(jobs = []) {
  const grouped = {
    incomingScheduled: [],
    awaitingReturnRequest: [],
    holdingOtherVehicles: [],
    returnRequests: [],
    staffReturning: [],
    oneWayReturning: [],
    returnedHome: [],
    settlement: [],
    other: [],
  };

  for (const job of jobs ?? []) {
    const phase = homeReturnPhase(job);
    if (phase === 'incoming_scheduled') grouped.incomingScheduled.push(job);
    else if (phase === 'awaiting_return_request') grouped.awaitingReturnRequest.push(job);
    else if (phase === 'holding_other_vehicle') grouped.holdingOtherVehicles.push(job);
    else if (phase === 'return_requested') grouped.returnRequests.push(job);
    else if (phase === 'staff_returning') grouped.staffReturning.push(job);
    else if (phase === 'one_way_returning') grouped.oneWayReturning.push(job);
    else if (phase === 'returned_home') grouped.returnedHome.push(job);
    else if (phase === 'settlement_done') grouped.settlement.push(job);
    else grouped.other.push(job);
  }

  return grouped;
}

export function crossReturnVehicleAvailability({ vehicle = {}, latestTransfer = null } = {}) {
  const status = String(latestTransfer?.status ?? '').toLowerCase();
  const homeReturnStatus = homeReturnStatusOf(latestTransfer);
  const homeOwnerId = homeOwnerIdOf(vehicle, latestTransfer);
  const currentOwnerId = ownerIdOf(latestTransfer?.receiving_owner_id ?? homeOwnerId);

  if (homeReturnStatus === 'returned_home') {
    return { searchable: true, mode: 'normal', homeOwnerId, currentOwnerId: homeOwnerId };
  }

  if (HOME_RETURN_BUSY_STATUSES.has(homeReturnStatus)) {
    return { searchable: false, mode: 'in_transit', homeOwnerId, currentOwnerId };
  }

  if (CROSS_RETURN_IN_TRANSIT_STATUSES.has(status)) {
    return { searchable: false, mode: 'in_transit', homeOwnerId, currentOwnerId };
  }

  if (
    CROSS_RETURN_RECEIVED_STATUSES.has(status)
    && homeOwnerId
    && currentOwnerId
    && currentOwnerId !== homeOwnerId
  ) {
    return { searchable: false, mode: 'held_away', homeOwnerId, currentOwnerId };
  }

  return { searchable: true, mode: 'normal', homeOwnerId, currentOwnerId: homeOwnerId };
}

export function buildCrossReturnPublicListing({
  dest,
  vehicle,
  receiverSetting,
  receiverOwner,
  fromLat,
  fromLng,
}) {
  if (!dest || !vehicle || !receiverSetting) return null;
  if (!receiverSetting.enabled) return null;
  if ((vehicle.status ?? 'active') !== 'active') return null;
  if ((vehicle.approval_status ?? 'approved') !== 'approved') return null;

  const startLat = toNumberOrNull(fromLat ?? vehicle.lat);
  const startLng = toNumberOrNull(fromLng ?? vehicle.lng);
  const endLat = toNumberOrNull(receiverSetting.lat);
  const endLng = toNumberOrNull(receiverSetting.lng);
  if (startLat == null || startLng == null || endLat == null || endLng == null) return null;

  const fromName = vehicle.loc || 'Origin';
  const toName = receiverSetting.location || receiverOwner?.store_location || receiverOwner?.store_name || 'Return';

  return {
    id: `crb-${dest.vehicle_id}-${dest.receiving_owner_id}`,
    vehicleId: vehicle.id,
    originOwnerId: dest.origin_owner_id ?? vehicle.owner_id ?? vehicle.ownerId ?? null,
    receivingOwnerId: dest.receiving_owner_id,
    routePolicy: 'outbound_to_receiver',
    maker: vehicle.maker,
    model: vehicle.model,
    img: vehicle.img_url,
    cls: vehicle.cls,
    from: { name: fromName, lat: startLat, lng: startLng },
    to: { name: toName, lat: endLat, lng: endLng },
    distanceKm: haversineKm(startLat, startLng, endLat, endLng),
    basePrice: Number(vehicle.price_day ?? 0),
    baseFee: coerceCrossReturnBaseFee(dest.base_fee ?? dest.baseFee),
    feeMode: receiverSetting.fee_mode,
    storagePerDay: Number(receiverSetting.storage_per_day ?? 0),
    splitType: receiverSetting.split_type,
    splitValue: Number(receiverSetting.split_value ?? 0),
    expectedDays: coerceExpectedStorageDays(dest.expected_days),
    status: 'open',
  };
}

export function buildHomewardCrossReturnListing({
  transfer,
  vehicle,
  holderSetting,
  homeSetting,
  holderOwner,
  homeOwner,
}) {
  if (!transfer || !vehicle || !holderSetting) return null;
  if ((vehicle.status ?? 'active') !== 'active') return null;
  if ((vehicle.approval_status ?? 'approved') !== 'approved') return null;

  const availability = crossReturnVehicleAvailability({ vehicle, latestTransfer: transfer });
  if (availability.mode !== 'homeward') return null;

  const startLat = toNumberOrNull(holderSetting.lat);
  const startLng = toNumberOrNull(holderSetting.lng);
  const endLat = toNumberOrNull(homeSetting?.lat ?? vehicle.lat);
  const endLng = toNumberOrNull(homeSetting?.lng ?? vehicle.lng);
  if (startLat == null || startLng == null || endLat == null || endLng == null) return null;

  const fromName = holderSetting.location || holderOwner?.store_location || holderOwner?.store_name || 'Pickup';
  const toName = homeSetting?.location || homeOwner?.store_location || homeOwner?.store_name || vehicle.loc || 'Home';

  return {
    id: `crh-${transfer.id ?? transfer.vehicle_id}-${availability.currentOwnerId}-${availability.homeOwnerId}`,
    vehicleId: vehicle.id,
    originOwnerId: availability.currentOwnerId,
    custodyOwnerId: availability.currentOwnerId,
    receivingOwnerId: availability.homeOwnerId,
    sourceCrossReturnId: transfer.id ?? null,
    routePolicy: 'homeward_only',
    maker: vehicle.maker,
    model: vehicle.model,
    img: vehicle.img_url,
    cls: vehicle.cls,
    from: { name: fromName, lat: startLat, lng: startLng },
    to: { name: toName, lat: endLat, lng: endLng },
    distanceKm: haversineKm(startLat, startLng, endLat, endLng),
    basePrice: Number(vehicle.price_day ?? 0),
    baseFee: coerceCrossReturnBaseFee(transfer.base_fee),
    feeMode: holderSetting.fee_mode,
    storagePerDay: Number(holderSetting.storage_per_day ?? 0),
    splitType: holderSetting.split_type,
    splitValue: Number(holderSetting.split_value ?? 0),
    expectedDays: coerceExpectedStorageDays(transfer.days_stored || 1),
    status: 'open',
  };
}
