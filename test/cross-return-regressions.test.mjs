import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('cross-return public listings can be fetched without an owner id', async () => {
  const { crossReturnModeRequiresOwnerId } = await import('../lib/crossReturn.js');
  const route = read('app/api/owner/cross-return/route.js');

  assert.equal(crossReturnModeRequiresOwnerId('public-listings'), false);
  assert.equal(crossReturnModeRequiresOwnerId('settings'), true);
  assert.equal(crossReturnModeRequiresOwnerId('receivers'), true);
  assert.match(route, /crossReturnModeRequiresOwnerId\(mode\) && !ownerId/);
});

test('saved vehicle return destinations become public cross-return listings', async () => {
  const { buildCrossReturnPublicListing } = await import('../lib/crossReturn.js');

  const listing = buildCrossReturnPublicListing({
    dest: {
      vehicle_id: 'vehicle-1',
      origin_owner_id: 'origin-owner',
      receiving_owner_id: 'receiver-owner',
      expected_days: 2,
      base_fee: 2500,
    },
    vehicle: {
      id: 'vehicle-1',
      maker: 'Toyota',
      model: 'Noah',
      img_url: '/noah.jpg',
      cls: 'minivan',
      lat: '34.4186',
      lng: '135.3324',
      loc: '大阪府泉佐野市鶴原1840-1',
      price_day: 9000,
      status: 'active',
    },
    receiverSetting: {
      owner_id: 'receiver-owner',
      enabled: true,
      location: '京都駅',
      lat: '35.0116',
      lng: '135.7681',
      fee_mode: 'storage',
      storage_per_day: 1000,
      split_type: 'percent',
      split_value: 50,
    },
    receiverOwner: {
      id: 'receiver-owner',
      store_name: 'Kyoto Cars',
      store_location: '京都市',
    },
    fromLat: '34.4186',
    fromLng: '135.3324',
  });

  assert.equal(listing.id, 'crb-vehicle-1-receiver-owner');
  assert.equal(listing.vehicleId, 'vehicle-1');
  assert.equal(listing.receivingOwnerId, 'receiver-owner');
  assert.deepEqual(listing.from, {
    name: '大阪府泉佐野市鶴原1840-1',
    lat: 34.4186,
    lng: 135.3324,
  });
  assert.deepEqual(listing.to, { name: '京都駅', lat: 35.0116, lng: 135.7681 });
  assert.equal(listing.basePrice, 9000);
  assert.equal(listing.baseFee, 2500);
  assert.equal(listing.storagePerDay, 1000);
  assert.equal(listing.expectedDays, 2);
  assert.ok(listing.distanceKm > 0);
});

test('vehicle-level cross-return basic fee is saved, listed, and charged to the customer', async () => {
  const { computeCrossReturnCustomerFee } = await import('../lib/crossReturn.js');
  const route = read('app/api/owner/cross-return/route.js');
  const panel = read('components/CrossReturnPanel.jsx');
  const booking = read('components/BookingModal.jsx');
  const schema = read('supabase/CROSS_RETURN_MAP_地図.sql');

  assert.equal(
    computeCrossReturnCustomerFee({
      baseFee: 2500,
      feeMode: 'storage',
      storagePerDay: 1000,
      expectedDays: 2,
    }).total,
    4500,
  );

  assert.match(route, /receiving_owner_id, expected_days, base_fee/);
  assert.match(route, /baseFee/);
  assert.match(route, /base_fee: baseFee/);
  assert.match(panel, /vehBaseFees/);
  assert.match(panel, /cr_baseFee/);
  assert.match(booking, /computeCrossReturnCustomerFee/);
  assert.match(booking, /crossReturnFee\.total/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS base_fee/);
});

test('owner vehicle cross-return number fields can be cleared while editing', async () => {
  const {
    coerceCrossReturnBaseFee,
    coerceExpectedStorageDays,
    draftNumberInputValue,
  } = await import('../lib/crossReturn.js');
  const panel = read('components/CrossReturnPanel.jsx');

  assert.equal(draftNumberInputValue('', 1), '');
  assert.equal(draftNumberInputValue(undefined, 1), 1);
  assert.equal(coerceExpectedStorageDays(''), 1);
  assert.equal(coerceExpectedStorageDays('12'), 12);
  assert.equal(coerceCrossReturnBaseFee(''), 0);
  assert.equal(coerceCrossReturnBaseFee('050000'), 50000);

  assert.match(panel, /draftNumberInputValue\(vehDays\[String\(v\.id\)\], 1\)/);
  assert.match(panel, /draftNumberInputValue\(vehBaseFees\[String\(v\.id\)\], 0\)/);
  assert.match(panel, /coerceExpectedStorageDays\(vehDays\[String\(vehicleId\)\]\)/);
  assert.match(panel, /coerceCrossReturnBaseFee\(vehBaseFees\[String\(vehicleId\)\]\)/);
  assert.match(panel, /\[String\(v\.id\)\]: e\.target\.value/);
});

test('cross-return public listings hide unapproved vehicles', async () => {
  const { buildCrossReturnPublicListing } = await import('../lib/crossReturn.js');

  const listing = buildCrossReturnPublicListing({
    dest: { vehicle_id: 'vehicle-1', receiving_owner_id: 'receiver-owner' },
    vehicle: {
      id: 'vehicle-1',
      maker: 'Toyota',
      model: 'Noah',
      lat: 34.4186,
      lng: 135.3324,
      loc: '大阪府泉佐野市',
      price_day: 9000,
      status: 'active',
      approval_status: 'pending',
    },
    receiverSetting: {
      enabled: true,
      location: '京都駅',
      lat: 35.0116,
      lng: 135.7681,
      fee_mode: 'storage',
      storage_per_day: 1000,
    },
  });

  assert.equal(listing, null);
});

test('cross-return operating policy blocks in-transit and held-away cars until the owner requests a return method', async () => {
  const {
    crossReturnVehicleAvailability,
  } = await import('../lib/crossReturn.js');
  const route = read('app/api/owner/cross-return/route.js');
  const booth = read('components/CrossReturnBooth.jsx');
  const booking = read('components/BookingModal.jsx');

  assert.deepEqual(
    crossReturnVehicleAvailability({
      vehicle: { owner_id: 'owner-a' },
      latestTransfer: { status: 'accepted', origin_owner_id: 'owner-a', receiving_owner_id: 'owner-b' },
    }),
    { searchable: false, mode: 'in_transit', homeOwnerId: 'owner-a', currentOwnerId: 'owner-b' },
  );
  assert.deepEqual(
    crossReturnVehicleAvailability({
      vehicle: { owner_id: 'owner-a' },
      latestTransfer: { status: 'received', origin_owner_id: 'owner-a', receiving_owner_id: 'owner-b' },
    }),
    { searchable: false, mode: 'held_away', homeOwnerId: 'owner-a', currentOwnerId: 'owner-b' },
  );
  assert.deepEqual(
    crossReturnVehicleAvailability({
      vehicle: { owner_id: 'owner-a' },
      latestTransfer: { status: 'received', origin_owner_id: 'owner-a', receiving_owner_id: 'owner-b', home_return_status: 'returned_home' },
    }),
    { searchable: true, mode: 'normal', homeOwnerId: 'owner-a', currentOwnerId: 'owner-a' },
  );

  assert.match(route, /latestCrossReturnByVehicle/);
  assert.match(route, /crossReturnVehicleAvailability/);
  assert.match(route, /availability\.mode === 'in_transit'/);
  assert.doesNotMatch(route, /availability\.mode === 'homeward'/);
  assert.match(route, /status === 'received'/);
  assert.match(route, /\.from\('vehicles'\)\.update\(\{ lat:/);
  assert.match(booth, /originOwnerId: listing\.originOwnerId/);
  assert.match(booking, /originOwnerId: cr\.originOwnerId \?\?/);
});

test('cross-return owner operations use owner-requested return methods before receiver action', async () => {
  const {
    bestGoInspectionAction,
    bestGoInspectionKey,
    bestGoWorkflowState,
    composeBestGoSharedInspections,
    crossReturnVehicleAvailability,
    groupCrossReturnJobs,
    homeReturnPhase,
  } = await import('../lib/crossReturn.js');
  const route = read('app/api/owner/cross-return/route.js');
  const oneWayRoute = read('app/api/one-way/listings/route.js');
  const panel = read('components/CrossReturnPanel.jsx');
  const i18n = read('lib/i18n.js');
  const sql = read('supabase/SUPABASE_今回実行するSQL.sql');

  const jobs = [
    { id: 'incoming', role: 'receiving', status: 'accepted' },
    { id: 'owner-away', role: 'origin', status: 'received', homeReturnStatus: 'holding' },
    { id: 'holding', role: 'receiving', status: 'received', homeReturnStatus: 'holding' },
    { id: 'request-staff', role: 'receiving', status: 'received', homeReturnStatus: 'staff_requested' },
    { id: 'request-oneway', role: 'receiving', status: 'received', homeReturnStatus: 'one_way_requested' },
    { id: 'staff', role: 'receiving', status: 'received', homeReturnStatus: 'staff_returning' },
    { id: 'listed', role: 'receiving', status: 'received', homeReturnStatus: 'one_way_listed' },
    { id: 'home', role: 'origin', status: 'received', homeReturnStatus: 'returned_home' },
  ];
  const grouped = groupCrossReturnJobs(jobs);

  assert.equal(homeReturnPhase(jobs[0]), 'incoming_scheduled');
  assert.equal(homeReturnPhase(jobs[1]), 'awaiting_return_request');
  assert.equal(homeReturnPhase(jobs[2]), 'holding_other_vehicle');
  assert.equal(homeReturnPhase(jobs[3]), 'return_requested');
  assert.equal(homeReturnPhase(jobs[4]), 'return_requested');
  assert.equal(homeReturnPhase(jobs[5]), 'staff_returning');
  assert.equal(homeReturnPhase(jobs[6]), 'one_way_returning');
  assert.equal(homeReturnPhase(jobs[7]), 'returned_home');
  assert.deepEqual(bestGoWorkflowState({ status: 'accepted', homeReturnStatus: 'holding' }), {
    activeStep: 'arrival_inspection',
    statusKey: 'cr_flowStatusArrivalCheck',
  });
  assert.deepEqual(bestGoWorkflowState({ status: 'received', homeReturnStatus: 'one_way_listed' }), {
    activeStep: 'one_way_public',
    statusKey: 'cr_flowStatusPublic',
  });
  assert.deepEqual(bestGoWorkflowState({ status: 'received', homeReturnStatus: 'one_way_booked' }), {
    activeStep: 'one_way_reserved',
    statusKey: 'cr_flowStatusReserved',
  });
  assert.deepEqual(bestGoWorkflowState({ status: 'received', homeReturnStatus: 'one_way_returning' }), {
    activeStep: 'moving_home',
    statusKey: 'cr_flowStatusMoving',
  });
  assert.deepEqual(bestGoWorkflowState({ status: 'received', homeReturnStatus: 'returned_home' }), {
    activeStep: 'home_inspection',
    statusKey: 'cr_flowStatusHomeCheck',
  });
  assert.deepEqual(bestGoWorkflowState({ status: 'settled', homeReturnStatus: 'returned_home' }), {
    activeStep: 'normal_public',
    statusKey: 'cr_flowStatusNormalPublic',
  });
  assert.equal(bestGoInspectionKey({ reservationId: 'R1', crossReturnId: 'CR1', leg: 'outbound' }), 'R1:best-go:CR1:outbound');
  assert.equal(bestGoInspectionAction({
    id: 'CR1',
    reservationId: 'R1',
    role: 'origin',
    status: 'accepted',
    homeReturnStatus: 'holding',
  }), null);
  assert.deepEqual(bestGoInspectionAction({
    id: 'CR1',
    reservationId: 'R1',
    role: 'receiving',
    status: 'received',
    homeReturnStatus: 'holding',
  }), {
    inspectionId: 'R1:best-go:CR1:outbound',
    phase: 'after',
    buttonKey: 'cr_inspectionOutboundArrivalButton',
    titleKey: 'cr_inspectionOutboundTitle',
    hintKey: 'cr_inspectionArrivalHint',
  });
  const sharedInspections = composeBestGoSharedInspections({
    reservationInspection: {
      id: 'R1',
      leg: 'reservation',
      photos: {
        front: { before: 'normal-before-front', after: 'normal-after-front' },
        rear: { after: 'normal-after-rear' },
      },
      estCost: 9999,
    },
    outboundInspection: {
      id: 'R1:best-go:CR1:outbound',
      leg: 'outbound',
      photos: {
        front: { after: 'receiver-after-front' },
        side: { after: 'receiver-after-side' },
      },
    },
    homewardInspection: null,
    outboundInspectionId: 'R1:best-go:CR1:outbound',
  });
  assert.equal(sharedInspections.length, 1);
  assert.equal(sharedInspections[0].leg, 'outbound');
  assert.equal(sharedInspections[0].id, 'R1:best-go:CR1:outbound');
  assert.deepEqual(sharedInspections[0].photos.front, {
    after: 'receiver-after-front',
    before: 'normal-before-front',
  });
  assert.deepEqual(sharedInspections[0].photos.side, { after: 'receiver-after-side' });
  assert.equal(sharedInspections[0].photos.rear, undefined);
  assert.equal(sharedInspections[0].estCost, 0);
  assert.equal(sharedInspections.find(insp => insp.leg === 'reservation'), undefined);
  assert.deepEqual(bestGoInspectionAction({
    id: 'CR1',
    reservationId: 'R1',
    role: 'receiving',
    status: 'received',
    homeReturnStatus: 'one_way_listed',
  }), {
    inspectionId: 'R1:best-go:CR1:homeward',
    phase: 'before',
    buttonKey: 'cr_inspectionHomewardDepartureButton',
    titleKey: 'cr_inspectionHomewardTitle',
    hintKey: 'cr_inspectionHomewardDepartureHint',
  });
  assert.deepEqual(bestGoInspectionAction({
    id: 'CR1',
    reservationId: 'R1',
    role: 'origin',
    status: 'received',
    homeReturnStatus: 'one_way_returning',
  }), {
    inspectionId: 'R1:best-go:CR1:homeward',
    phase: 'after',
    buttonKey: 'cr_inspectionHomewardArrivalButton',
    titleKey: 'cr_inspectionHomewardTitle',
    hintKey: 'cr_inspectionArrivalHint',
  });
  assert.deepEqual(grouped.incomingScheduled.map(x => x.id), ['incoming']);
  assert.deepEqual(grouped.awaitingReturnRequest.map(x => x.id), ['owner-away']);
  assert.deepEqual(grouped.holdingOtherVehicles.map(x => x.id), ['holding']);
  assert.deepEqual(grouped.returnRequests.map(x => x.id), ['request-staff', 'request-oneway']);
  assert.deepEqual(grouped.staffReturning.map(x => x.id), ['staff']);
  assert.deepEqual(grouped.oneWayReturning.map(x => x.id), ['listed']);
  assert.deepEqual(grouped.returnedHome.map(x => x.id), ['home']);

  assert.equal(
    crossReturnVehicleAvailability({
      vehicle: { owner_id: 'owner-a' },
      latestTransfer: {
        status: 'received',
        origin_owner_id: 'owner-a',
        receiving_owner_id: 'owner-b',
        home_return_status: 'staff_returning',
      },
    }).searchable,
    false,
  );
  assert.equal(
    crossReturnVehicleAvailability({
      vehicle: { owner_id: 'owner-a' },
      latestTransfer: {
        status: 'received',
        origin_owner_id: 'owner-a',
        receiving_owner_id: 'owner-b',
        home_return_status: 'returned_home',
      },
    }).mode,
    'normal',
  );

  assert.match(route, /request-staff-return/);
  assert.match(route, /request-one-way-return/);
  assert.match(route, /start-staff-return/);
  assert.match(route, /publish-home-return-one-way/);
  assert.match(route, /mark-returned-home/);
  assert.match(route, /bestGoInspectionKey/);
  assert.match(route, /composeBestGoSharedInspections/);
  assert.match(route, /sharedPhotosFor\(r\.reservation_id, r\.id\)/);
  assert.match(route, /\.from\('damage_inspections'\)\.select\('reservation_id, photos, analysis, est_cost, mode'\)\.in\('reservation_id', inspectionIds\)/);
  assert.match(route, /ownerId.*cur\.origin_owner_id/);
  assert.match(route, /ownerId.*cur\.receiving_owner_id/);
  assert.match(route, /\.from\('one_way_listings'\)\.insert/);
  assert.match(route, /home_return_status: 'staff_requested'/);
  assert.match(route, /home_return_status: 'one_way_requested'/);
  assert.match(route, /home_return_status: 'staff_returning'/);
  assert.match(route, /home_return_status: 'returned_home'/);
  assert.match(oneWayRoute, /source_cross_return_id/);
  assert.match(oneWayRoute, /home_return_status: 'one_way_booked'/);
  assert.match(panel, /groupCrossReturnJobs/);
  assert.match(panel, /requestStaffReturn/);
  assert.match(panel, /requestHomeReturnOneWay/);
  assert.match(panel, /BestGoJobTimeline/);
  assert.match(panel, /BEST_GO_WORKFLOW_STEPS/);
  assert.match(panel, /bestGoInspectionAction/);
  assert.match(panel, /openInspection/);
  assert.match(panel, /inspectionPhase/);
  assert.match(panel, /inspectionLabels/);
  assert.match(panel, /cr_inspectionDeparturePhase/);
  assert.match(panel, /cr_inspectionArrivalPhase/);
  assert.match(panel, /bestGoWorkflowState/);
  assert.match(read('components/DamageInspection.jsx'), /initialPhase = null/);
  assert.match(read('components/DamageInspection.jsx'), /requestedPhase/);
  assert.match(read('app/api/inspection\/analyze\/route.js'), /angles/);
  assert.match(i18n, /cr_flowArrivalInspection/);
  assert.match(i18n, /cr_flowStatusPublic/);
  assert.match(i18n, /cr_flowStatusReserved/);
  assert.match(i18n, /cr_flowStatusMoving/);
  assert.match(i18n, /cr_inspectionOutboundDepartureButton/);
  assert.match(i18n, /cr_inspectionHomewardArrivalButton/);
  assert.match(panel, /cr_confirmNormalPublic/);
  assert.match(panel, /cr_homeReturnStaff/);
  assert.match(panel, /cr_homeReturnOneWay/);
  assert.match(panel, /cr_markReturnedHome/);
  assert.match(sql, /home_return_method TEXT DEFAULT 'undecided'/);
  assert.match(sql, /home_return_status TEXT DEFAULT 'holding'/);
  assert.match(sql, /home_return_one_way_listing_id UUID/);
});

test('one-way pickup verification advances a home-return listing to moving', () => {
  const route = read('app/api/owner/pickup-records/route.js');

  assert.match(route, /\.from\('one_way_listings'\)/);
  assert.match(route, /source_cross_return_id/);
  assert.match(route, /reservation_id.*r\.id/);
  assert.match(route, /home_return_status: 'one_way_returning'/);
  assert.match(route, /home_return_started_at/);
});

test('cross-return send page lists held third-party cars instead of own reservations', () => {
  const panel = read('components/CrossReturnPanel.jsx');
  const i18n = read('lib/i18n.js');

  assert.match(panel, /sendableJobs/);
  assert.match(panel, /data-cross-return-held-cars/);
  assert.match(panel, /\.\.\.grouped\.holdingOtherVehicles/);
  assert.match(panel, /\.\.\.grouped\.returnRequests/);
  assert.match(panel, /cr_sendWaitingRequest/);
  assert.match(panel, /cr_sendAlreadyMoving/);
  assert.match(panel, /startStaffReturn\(x\.id\)/);
  assert.match(panel, /publishHomeReturnOneWay\(x\.id\)/);
  assert.doesNotMatch(panel, /data-cross-return-reservation-cards/);
  assert.doesNotMatch(panel, /myReservations\.map/);
  assert.doesNotMatch(panel, /type: 'create', originOwnerId: ownerId/);
  assert.match(i18n, /cr_sendWaitingRequest/);
  assert.match(i18n, /cr_sendAlreadyMoving/);
});

test('cross-return map address search focuses and zooms the map', async () => {
  const { focusMapOnCoordinates } = await import('../lib/googleMaps.js');
  const calls = [];
  const position = { lat: 34.4186, lng: 135.3324 };
  const map = {
    getZoom: () => 8,
    setCenter: (pos) => calls.push(['setCenter', pos]),
    panTo: (pos) => calls.push(['panTo', pos]),
    setZoom: (zoom) => calls.push(['setZoom', zoom]),
  };
  const google = {
    maps: {
      event: {
        trigger: (target, eventName) => calls.push(['trigger', target === map, eventName]),
      },
    },
  };

  assert.equal(focusMapOnCoordinates({ google, map, position }), true);
  assert.deepEqual(calls, [
    ['trigger', true, 'resize'],
    ['setCenter', position],
    ['panTo', position],
    ['setZoom', 17],
  ]);
});

test('cross-return address search falls back to server geocoding when Google returns no result', async () => {
  const { geocodeAddress } = await import('../lib/googleMaps.js');
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const fetchCalls = [];

  global.window = {
    google: {
      maps: {
        Geocoder: class {
          geocode(_request, callback) {
            callback([], 'ZERO_RESULTS');
          }
        },
      },
    },
  };
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        lat: 34.4186,
        lng: 135.3324,
        formatted: '大阪府泉佐野市鶴原1840-1',
      }),
    };
  };

  try {
    const hit = await geocodeAddress('大阪府泉佐野市鶴原1840-1');
    assert.deepEqual(hit, {
      lat: 34.4186,
      lng: 135.3324,
      formatted: '大阪府泉佐野市鶴原1840-1',
    });
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0], /^\/api\/geocode\?address=/);
  } finally {
    global.window = originalWindow;
    global.fetch = originalFetch;
  }
});
