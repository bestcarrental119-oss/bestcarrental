import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner vehicle save waits for persistence before reloading pending review vehicles', () => {
  const owner = read('components/OwnerDashboard.jsx');

  assert.match(owner, /const handleSave = async \(\) =>/);
  assert.match(owner, /await dispatch\(\{ type: 'UPSERT_VEHICLE'/);
  assert.match(owner, /await onSaved\?\.\(\)/);
  assert.match(owner, /onSaved=\{async \(\) => \{/);
  assert.match(owner, /await loadData\(\)/);
});

test('admin reservation and revenue views handle snake_case and camelCase vehicle ownership ids', () => {
  const admin = read('components/AdminApp.jsx');

  assert.match(admin, /function vehicleIdOf/);
  assert.match(admin, /function vehicleOwnerId/);
  assert.match(admin, /function reservationVehicleId/);
  assert.match(admin, /vehicles\.find\(vehicle => String\(vehicleIdOf\(vehicle\)\) === String\(reservationVehicleId\(r\)\)\)/);
  assert.match(admin, /reservationOwnerId\(reservation, vehicleById\)/);
  assert.match(admin, /vehicleNames/);
  assert.match(admin, /row\.vehicleNames/);
});

test('owner backend reservation APIs look up both owner row id and approved login user id', () => {
  const ownerReservations = read('app/api/owner/reservations/route.js');
  const ownerVehicles = read('app/api/owner/vehicles/route.js');

  assert.match(ownerReservations, /ownerLookupIds/);
  assert.match(ownerReservations, /\.in\('owner_id', ownerLookupIds\)/);
  assert.match(ownerReservations, /\.in\('vehicle_id', vehicleIds\)/);
  assert.match(ownerVehicles, /ownerLookupIds/);
  assert.match(ownerVehicles, /\.in\('owner_id', ownerLookupIds\)/);
});

test('owner vehicle list includes pending and approved vehicles linked by owner auth id', () => {
  const ownerVehicles = read('app/api/owner/vehicles/route.js');
  const ownerDashboard = read('components/OwnerDashboard.jsx');

  assert.match(ownerVehicles, /owner_auth_id/);
  assert.match(ownerVehicles, /mergeVehicleRows/);
  assert.doesNotMatch(ownerVehicles, /\.eq\('approval_status', 'approved'\)/);
  assert.match(ownerDashboard, /approvalBadge/);
  assert.match(ownerDashboard, /審査中/);
  assert.match(ownerDashboard, /承認済み/);
});
