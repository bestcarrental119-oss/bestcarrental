import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner can complete return after 10 return photos without requiring AI analysis', async () => {
  const {
    DEPARTURE_INSPECTION_POSITIONS,
    hasCompleteReturnInspectionPhotos,
    returnInspectionProgress,
  } = await import('../lib/inspectionPhotos.js');

  const completeReturn = Object.fromEntries(
    DEPARTURE_INSPECTION_POSITIONS.map(id => [id, { after: `return-photo-${id}` }]),
  );
  const beforeOnly = Object.fromEntries(
    DEPARTURE_INSPECTION_POSITIONS.map(id => [id, { before: `departure-photo-${id}` }]),
  );

  assert.equal(returnInspectionProgress(completeReturn), 10);
  assert.equal(hasCompleteReturnInspectionPhotos(completeReturn), true);
  assert.equal(hasCompleteReturnInspectionPhotos(beforeOnly), false);

  const pickupRoute = read('app/api/owner/pickup-records/route.js');
  const scanner = read('components/OwnerPickupScanner.jsx');
  const damageInspection = read('components/DamageInspection.jsx');
  const i18n = read('lib/i18nOwnerAdmin.js');

  assert.match(pickupRoute, /action === 'complete-return'/);
  assert.match(pickupRoute, /hasCompleteReturnInspectionPhotos/);
  assert.match(pickupRoute, /RETURN_REVIEW_STATUS/);
  assert.match(pickupRoute, /status:\s*RETURN_REVIEW_STATUS/);
  assert.match(pickupRoute, /review_deadline/);
  assert.match(pickupRoute, /return_inspection_required/);
  assert.match(pickupRoute, /\.select\('photos'\)/);
  assert.doesNotMatch(pickupRoute, /analysis[\s\S]{0,160}return_inspection_required/);

  assert.match(scanner, /completeReturnIfReady/);
  assert.match(scanner, /action: 'complete-return'/);
  assert.match(scanner, /ps_completeReturn/);
  assert.match(scanner, /ps_returnInspectionRequired/);
  assert.match(scanner, /ps_returnCompleted/);

  assert.match(damageInspection, /afterCount [=!]== POSITIONS\.length/);
  assert.match(damageInspection, /autoSavedAfterCompleteRef/);
  assert.match(damageInspection, /persist\(photos\)/);

  assert.match(i18n, /ps_completeReturn: '返却完了'/);
  assert.match(i18n, /ps_returnCompleted/);
  assert.match(i18n, /ps_returnInspectionRequired/);
});
