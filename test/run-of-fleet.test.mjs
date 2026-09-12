import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('run-of-fleet inventory subtracts both specific and class-based overlapping bookings', async () => {
  const {
    calculateClassAvailability,
  } = await import('../lib/runOfFleet.js');

  const vehicles = [
    { id: 'v1', owner_id: 'owner-1', cls: 'standard', status: 'active', approval_status: 'approved', holder: { runOfFleet: { enabled: true, class: 'standard', priceDay: 9000, location: 'KIX' } } },
    { id: 'v2', owner_id: 'owner-1', cls: 'standard', status: 'active', approval_status: 'approved', holder: { runOfFleet: { enabled: true, class: 'standard', priceDay: 9000, location: 'KIX' } } },
    { id: 'v3', owner_id: 'owner-1', cls: 'standard', status: 'active', approval_status: 'approved', holder: { runOfFleet: { enabled: true, class: 'standard', priceDay: 9000, location: 'KIX' } } },
    { id: 'v4', owner_id: 'owner-1', cls: 'kei', status: 'active', approval_status: 'approved' },
  ];
  const reservations = [
    { id: 'specific', vehicle_id: 'v1', pickup_at: '2026-07-01T10:00', return_at: '2026-07-03T10:00', status: 'confirmed' },
    { id: 'class', owner_id: 'owner-1', booking_type: 'class_based', target_class: 'Standard', pickup_at: '2026-07-02T10:00', return_at: '2026-07-04T10:00', status: 'pending_assignment' },
    { id: 'cancelled', vehicle_id: 'v2', pickup_at: '2026-07-02T10:00', return_at: '2026-07-04T10:00', status: 'cancelled' },
    { id: 'outside', vehicle_id: 'v3', pickup_at: '2026-07-05T10:00', return_at: '2026-07-06T10:00', status: 'confirmed' },
  ];

  const availability = calculateClassAvailability({
    vehicles,
    reservations,
    ownerId: 'owner-1',
    targetClass: 'standard',
    pickup: '2026-07-02T12:00',
    ret: '2026-07-03T12:00',
  });

  assert.equal(availability.totalVehicles, 3);
  assert.equal(availability.specificBookedCount, 1);
  assert.equal(availability.classBookedCount, 1);
  assert.equal(availability.availableCount, 1);
});

test('owner run-of-fleet booth settings control category inventory, image, location, and price', async () => {
  const {
    buildClassVirtualListings,
    calculateClassAvailability,
    RUN_OF_FLEET_CLASS_ASSETS,
  } = await import('../lib/runOfFleet.js');

  const vehicles = [
    {
      id: 'v1',
      owner_id: 'owner-1',
      cls: 'standard',
      status: 'active',
      approval_status: 'approved',
      maker: 'Toyota',
      model: 'Prius',
      loc: 'Hidden base',
      priceDay: 12000,
      holder: {
        runOfFleet: {
          enabled: true,
          class: 'compact',
          priceDay: 8800,
          location: 'KIX Airport Counter',
          image: '/run-of-fleet/compact-car.jpeg',
        },
      },
    },
    {
      id: 'v2',
      owner_id: 'owner-1',
      cls: 'standard',
      status: 'active',
      approval_status: 'approved',
      maker: 'Nissan',
      model: 'Note',
      holder: {
        runOfFleet: {
          enabled: true,
          class: 'compact',
          priceDay: 8800,
          location: 'KIX Airport Counter',
          image: '/run-of-fleet/compact-car.jpeg',
        },
      },
    },
    {
      id: 'v3',
      owner_id: 'owner-1',
      cls: 'standard',
      status: 'active',
      approval_status: 'approved',
      maker: 'Mazda',
      model: 'Axela',
    },
  ];

  const reservations = [
    { id: 'specific', vehicle_id: 'v1', pickup_at: '2026-07-02T10:00', return_at: '2026-07-04T10:00', status: 'confirmed' },
  ];

  const availability = calculateClassAvailability({
    vehicles,
    reservations,
    ownerId: 'owner-1',
    targetClass: 'compact',
    pickup: '2026-07-03T10:00',
    ret: '2026-07-05T10:00',
  });

  assert.equal(availability.totalVehicles, 2);
  assert.equal(availability.availableCount, 1);

  const listings = buildClassVirtualListings({
    vehicles,
    reservations,
    owners: [{ id: 'owner-1', store_name: 'KIX Best Cars' }],
    pickup: '2026-07-03T10:00',
    ret: '2026-07-05T10:00',
    selectedClass: 'all',
  });

  assert.equal(listings.length, 1);
  assert.equal(listings[0].targetClass, 'compact');
  assert.equal(listings[0].classAvailable, 1);
  assert.equal(listings[0].fleetTotal, 2);
  assert.equal(listings[0].priceDay, 8800);
  assert.equal(listings[0].loc, 'KIX Airport Counter');
  assert.equal(listings[0].img, '/classes/compact-car.png');
  assert.equal(RUN_OF_FLEET_CLASS_ASSETS.luxury_minivan.labelJa, '高級ミニバン');
});

test('run-of-fleet booths are visible on the frontend before dates are selected', async () => {
  const { buildClassVirtualListings } = await import('../lib/runOfFleet.js');

  const vehicles = [
    {
      id: 'kei-1',
      owner_id: 'owner-1',
      cls: 'kei',
      status: 'active',
      approval_status: 'approved',
      maker: 'Daihatsu',
      model: 'Tanto',
      priceDay: 6000,
      holder: {
        runOfFleet: {
          enabled: true,
          class: 'kei',
          priceDay: 5500,
          location: 'Naha Airport',
          image: '/run-of-fleet/kei-car.jpeg',
        },
      },
    },
  ];

  const listings = buildClassVirtualListings({
    vehicles,
    reservations: [],
    owners: [{ id: 'owner-1', store_name: 'Okinawa Best Cars' }],
    pickup: '',
    ret: '',
    selectedClass: 'all',
  });

  assert.equal(listings.length, 1);
  assert.equal(listings[0].listingType, 'class_based');
  assert.equal(listings[0].targetClass, 'kei');
  assert.equal(listings[0].img, '/classes/kei-car.png');
  assert.equal(listings[0].loc, 'Naha Airport');
  assert.equal(listings[0].classAvailable, 1);
  assert.equal(listings[0].fleetTotal, 1);
  assert.equal(listings[0].priceDay, 5500);
});

test('run-of-fleet owner id fallback supports vehicles keyed by owner auth id', async () => {
  const { buildClassVirtualListings } = await import('../lib/runOfFleet.js');

  const vehicles = [
    {
      id: 'other-1',
      owner_auth_id: 'auth-owner-1',
      cls: 'van',
      status: 'active',
      approval_status: 'approved',
      maker: 'Toyota',
      model: 'HiAce',
      priceDay: 12000,
      holder: {
        runOfFleet: {
          enabled: true,
          class: 'van',
          priceDay: 10000,
          location: '関西空港',
          image: '/run-of-fleet/van.jpeg',
        },
      },
    },
  ];

  const listings = buildClassVirtualListings({
    vehicles,
    reservations: [],
    pickup: '',
    ret: '',
    selectedClass: 'V',
  });

  assert.equal(listings.length, 1);
  assert.equal(listings[0].ownerId, 'auth-owner-1');
  assert.equal(listings[0].targetClass, 'other');
  assert.equal(listings[0].priceDay, 10000);
  assert.equal(listings[0].loc, '関西空港');
  assert.equal(listings[0].img, '/classes/other-vehicles.png');
});

test('run-of-fleet class listings can use approved private vehicles without exposing the vehicle card', async () => {
  const {
    buildClassVirtualListings,
    calculateClassAvailability,
  } = await import('../lib/runOfFleet.js');

  const vehicles = [
    {
      id: 'private-compact',
      owner_id: 'owner-1',
      cls: 'compact',
      type: 'corporate',
      status: 'inactive',
      approval_status: 'approved',
      maker: 'Toyota',
      model: 'Aqua',
      priceDay: 7200,
      holder: {
        runOfFleet: {
          enabled: true,
          class: 'compact',
          priceDay: 6500,
          location: 'KIX Counter',
          image: '/run-of-fleet/compact-car.jpeg',
        },
      },
    },
    {
      id: 'maintenance-compact',
      owner_id: 'owner-1',
      cls: 'compact',
      type: 'corporate',
      status: 'maintenance',
      approval_status: 'approved',
      holder: {
        runOfFleet: {
          enabled: true,
          class: 'compact',
          priceDay: 6500,
          location: 'KIX Counter',
        },
      },
    },
  ];

  const availability = calculateClassAvailability({
    vehicles,
    reservations: [],
    ownerId: 'owner-1',
    targetClass: 'compact',
    pickup: '2026-09-10T10:00',
    ret: '2026-09-11T10:00',
    location: 'KIX Counter',
  });

  assert.equal(availability.totalVehicles, 1);
  assert.equal(availability.availableCount, 1);

  const listings = buildClassVirtualListings({
    vehicles,
    reservations: [],
    owners: [{ id: 'owner-1', store_name: 'Best KIX' }],
    pickup: '2026-09-10T10:00',
    ret: '2026-09-11T10:00',
    selectedClass: 'compact',
  });

  assert.equal(listings.length, 1);
  assert.equal(listings[0].listingType, 'class_based');
  assert.equal(listings[0].vehicleId, null);
  assert.equal(listings[0].id, 'rof-owner-1-compact');
  assert.equal(listings[0].fleetTotal, 1);
  assert.equal(listings[0].classAvailable, 1);

  const availabilityRoute = read('app/api/vehicles/avail/route.js');
  assert.doesNotMatch(availabilityRoute, /\.eq\('status', 'active'\)/);
});

test('checkout payload keeps specific bookings backward compatible and sends class bookings with null vehicle id', async () => {
  const { buildReservationPayload } = await import('../lib/runOfFleet.js');
  const base = {
    id: 'BCR-2026-0001',
    ownerId: 'owner-1',
    userId: 'user-1',
    pickup: '2026-07-02T12:00',
    ret: '2026-07-03T12:00',
    days: 1,
    total: 7000,
    type: 'corporate',
    opts: {},
  };

  const specific = buildReservationPayload({ ...base, vehicle: { id: 'v1', cls: 'standard' } });
  assert.equal(specific.vehicleId, 'v1');
  assert.equal(specific.bookingType, 'specific');
  assert.equal(specific.assignmentStatus, 'assigned');
  assert.equal(specific.targetClass, 'standard');

  const snakeCaseOwner = buildReservationPayload({ ...base, ownerId: null, vehicle: { id: 'v2', owner_id: 'owner-from-db', cls: 'standard' } });
  assert.equal(snakeCaseOwner.vehicleId, 'v2');
  assert.equal(snakeCaseOwner.ownerId, 'owner-from-db');
  assert.equal(snakeCaseOwner.bookingType, 'specific');

  const classBased = buildReservationPayload({
    ...base,
    vehicle: { id: 'rof-owner-1-standard', listingType: 'class_based', targetClass: 'Standard' },
  });
  assert.equal(classBased.vehicleId, null);
  assert.equal(classBased.bookingType, 'class_based');
  assert.equal(classBased.assignmentStatus, 'pending_assignment');
  assert.equal(classBased.status, 'pending_assignment');
  assert.equal(classBased.targetClass, 'standard');
});

test('run-of-fleet API and owner assignment UI are wired with shared status names', () => {
  assert.ok(existsSync(new URL('../app/api/vehicles/avail/route.js', import.meta.url)));
  assert.ok(existsSync(new URL('../app/api/owner/reservations/[id]/available-vehicles/route.js', import.meta.url)));
  assert.ok(existsSync(new URL('../app/api/owner/reservations/[id]/assign/route.js', import.meta.url)));

  const reservationsApi = read('app/api/reservations/route.js');
  const availableVehiclesApi = read('app/api/owner/reservations/[id]/available-vehicles/route.js');
  const assignVehicleApi = read('app/api/owner/reservations/[id]/assign/route.js');
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const schema = read('supabase/run_of_fleet_schema.sql');

  assert.match(reservationsApi, /bookingType === 'class_based'/);
  assert.match(reservationsApi, /pending_assignment/);
  assert.doesNotMatch(availableVehiclesApi, /\.eq\('status', 'active'\)/);
  assert.match(availableVehiclesApi, /status !== 'maintenance'/);
  assert.match(assignVehicleApi, /approvalStatus !== 'approved'/);
  assert.match(ownerDashboard, /Action Required/);
  assert.match(ownerDashboard, /Assign Vehicle/);
  assert.match(schema, /create_class_based_reservation/);
  assert.match(schema, /booking_type TEXT NOT NULL DEFAULT 'specific'/);
});

test('owner dashboard exposes run-of-fleet booth manager and calendar accepts assigned camelCase reservations', () => {
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const ownerCalendar = read('components/OwnerCalendar.jsx');
  const runOfFleetCard = read('components/RunOfFleetCard.jsx');
  const vehiclePatchApi = read('app/api/vehicles/[id]/route.js');

  assert.match(ownerDashboard, /RunOfFleetBoothManager/);
  assert.match(ownerDashboard, /お任せブース/);
  assert.match(ownerDashboard, /RUN_OF_FLEET_CLASS_OPTIONS/);
  assert.match(ownerDashboard, /const holder = \{ \.\.\.\(vehicle\.holder/);
  assert.match(ownerCalendar, /r\.vehicle_id \?\? r\.vehicleId/);
  assert.match(runOfFleetCard, /v\.loc/);
  assert.match(runOfFleetCard, /classAvailable/);
  assert.match(vehiclePatchApi, /'holder'/);
});

test('owner assignment panel refreshes parent reservations and handles camelCase vehicle ids', () => {
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const assignmentPanel = read('components/RunOfFleetAssignmentPanel.jsx');

  assert.match(ownerDashboard, /onAssigned=\{loadData\}/);
  assert.match(assignmentPanel, /onAssigned\?\.\(updated\)/);
  assert.match(assignmentPanel, /r\?\.vehicle_id \?\? r\?\.vehicleId/);
  assert.doesNotMatch(assignmentPanel, /&& !r\.vehicle_id/);
});
