import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('pickup completion requires all 10 departure inspection photos', async () => {
  const {
    DEPARTURE_INSPECTION_POSITIONS,
    hasCompleteDepartureInspectionPhotos,
  } = await import('../lib/inspectionPhotos.js');
  const complete = Object.fromEntries(
    DEPARTURE_INSPECTION_POSITIONS.map(id => [id, { before: `photo-${id}` }]),
  );
  const missingOne = { ...complete };
  delete missingOne[DEPARTURE_INSPECTION_POSITIONS.at(-1)];

  assert.equal(DEPARTURE_INSPECTION_POSITIONS.length, 10);
  assert.equal(hasCompleteDepartureInspectionPhotos(complete), true);
  assert.equal(hasCompleteDepartureInspectionPhotos(missingOne), false);
  assert.equal(hasCompleteDepartureInspectionPhotos({ front: { after: 'return-only' } }), false);

  const pickupRoute = read('app/api/owner/pickup-records/route.js');
  const captureRoute = read('app/api/reservations/capture/route.js');
  const scanner = read('components/OwnerPickupScanner.jsx');
  const damageInspection = read('components/DamageInspection.jsx');
  const i18n = read('lib/i18nOwnerAdmin.js');

  assert.match(pickupRoute, /hasCompleteDepartureInspectionPhotos/);
  assert.match(pickupRoute, /requiresInspection/);
  assert.match(pickupRoute, /pickupVerified/);
  assert.match(pickupRoute, /readyForPickupStart/);
  assert.match(pickupRoute, /markPickupVerified/);
  assert.match(pickupRoute, /action === 'complete-pickup'/);
  assert.match(pickupRoute, /departure_inspection_required/);
  assert.match(pickupRoute, /pickup_payment_not_ready/);
  assert.match(pickupRoute, /paymentIntents\.capture/);
  assert.match(pickupRoute, /PICKUP_ACTIVE_STATUS/);
  assert.match(pickupRoute, /status:\s*PICKUP_ACTIVE_STATUS/);
  assert.doesNotMatch(pickupRoute, /if \(inspectionComplete\) \{\s*await markPickupVerified\(r\.id/);
  const patchInspectionCheck = pickupRoute.indexOf('const inspectionComplete = await hasCompleteDepartureInspection(rec.reservation_id)');
  const patchMarkVerified = pickupRoute.indexOf('await markPickupVerified(rec.reservation_id');
  assert.ok(patchInspectionCheck >= 0);
  assert.ok(patchMarkVerified > patchInspectionCheck);
  assert.match(captureRoute, /hasCompleteDepartureInspectionPhotos/);
  assert.match(captureRoute, /code: 'departure_inspection_required'/);
  assert.match(captureRoute, /before pickup capture/);

  assert.match(scanner, /completePickupIfReady/);
  assert.match(scanner, /requiresInspection/);
  assert.match(scanner, /action: 'complete-pickup'/);
  assert.match(scanner, /ps_startPickup/);
  assert.match(scanner, /ps_pickupAlreadyStarted/);
  assert.match(scanner, /ps_inspectionRequired/);
  assert.match(scanner, /ps_pickupCompleted/);
  assert.doesNotMatch(scanner, /onClose=\{async \(\) => \{\s*const rec = inspectRec;[\s\S]*await completePickupIfReady\(rec\);/);
  assert.match(damageInspection, /DEPARTURE_INSPECTION_POSITIONS/);
  assert.match(damageInspection, /autoSavedBeforeCompleteRef/);
  assert.match(damageInspection, /beforeCount [=!]== POSITIONS\.length/);
  assert.match(damageInspection, /persist\(photos\)/);
  assert.match(i18n, /ps_inspectionRequired/);
  assert.match(i18n, /ps_pickupCompleted/);
  assert.match(i18n, /ps_startPickup: '貸出開始'/);
  assert.match(i18n, /ps_pickupAlreadyStarted/);
});
