import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const EXPECTED_CLASSES = [
  ['kei', 'K', 'K Kei Car', '軽自動車', '/classes/kei-car.png'],
  ['compact', 'S', 'S Compact Car', 'コンパクトカー', '/classes/compact-car.png'],
  ['standard', 'G', 'G Standard Car', '普通自動車', '/classes/standard-car.png'],
  ['suv', 'SUV', 'SUV', 'SUV', '/classes/suv.png'],
  ['minivan', 'F1', 'F1 Minivan', 'ミニバン', '/classes/minivan-f1.png'],
  ['luxury_minivan', 'F2', 'F2 Luxury Minivan', '高級ミニバン', '/classes/luxury-minivan-f2.png'],
  ['other', 'V', 'V Other Vehicles', 'その他・特殊車種', '/classes/other-vehicles.png'],
];

test('vehicle classes use the new illustrated lineup for registration and search', async () => {
  const { VEHICLE_CLASSES } = await import('../lib/data.js');
  const classes = VEHICLE_CLASSES.filter(c => c.id !== 'all');

  assert.deepEqual(classes.map(c => c.id), EXPECTED_CLASSES.map(([id]) => id));
  assert.deepEqual(classes.map(c => c.icon), EXPECTED_CLASSES.map(([, code]) => code));

  for (const [id, code, label, ja, img] of EXPECTED_CLASSES) {
    const cls = classes.find(c => c.id === id);
    assert.equal(cls.code, code);
    assert.equal(cls.label, label);
    assert.equal(cls.ja, ja);
    assert.equal(cls.img, img);
    assert.ok(existsSync(join(root, 'public', img.slice(1))), `${img} should exist`);
  }
});

test('run-of-fleet class-only publishing uses the same lineup and normalizes legacy van classes', async () => {
  const {
    RUN_OF_FLEET_CLASS_ASSETS,
    RUN_OF_FLEET_CLASS_OPTIONS,
    normalizeVehicleClass,
    upgradeClassesFor,
  } = await import('../lib/runOfFleet.js');

  assert.deepEqual(RUN_OF_FLEET_CLASS_OPTIONS.map(option => option.id), EXPECTED_CLASSES.map(([id]) => id));
  assert.equal(RUN_OF_FLEET_CLASS_ASSETS.suv.labelJa, 'SUV');
  assert.equal(RUN_OF_FLEET_CLASS_ASSETS.other.labelJa, 'その他・特殊車種');
  assert.equal(RUN_OF_FLEET_CLASS_ASSETS.luxury_minivan.label, 'F2 Luxury Minivan');

  assert.equal(normalizeVehicleClass('K'), 'kei');
  assert.equal(normalizeVehicleClass('S'), 'compact');
  assert.equal(normalizeVehicleClass('G'), 'standard');
  assert.equal(normalizeVehicleClass('F1'), 'minivan');
  assert.equal(normalizeVehicleClass('F2'), 'luxury_minivan');
  assert.equal(normalizeVehicleClass('V'), 'other');
  assert.equal(normalizeVehicleClass('van'), 'other');
  assert.equal(normalizeVehicleClass('large-van'), 'other');

  assert.deepEqual(upgradeClassesFor('standard'), ['standard', 'suv', 'minivan', 'luxury_minivan', 'other']);
});
