export const DEPARTURE_INSPECTION_POSITIONS = [
  'front_left',
  'front',
  'front_right',
  'rear_right',
  'rear',
  'rear_left',
  'windshield',
  'meter',
  'front_seats',
  'rear_seats',
];

export function inspectionProgress(photos = {}, phase = 'before') {
  return DEPARTURE_INSPECTION_POSITIONS.filter(id => Boolean(photos?.[id]?.[phase])).length;
}

export function departureInspectionProgress(photos = {}) {
  return inspectionProgress(photos, 'before');
}

export function hasCompleteDepartureInspectionPhotos(photos = {}) {
  return departureInspectionProgress(photos) === DEPARTURE_INSPECTION_POSITIONS.length;
}

export function returnInspectionProgress(photos = {}) {
  return inspectionProgress(photos, 'after');
}

export function hasCompleteReturnInspectionPhotos(photos = {}) {
  return returnInspectionProgress(photos) === DEPARTURE_INSPECTION_POSITIONS.length;
}
