import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('store map groups public listings by pickup store and keeps class-only listings inside the store', async () => {
  const { buildStoreMapGroups } = await import('../lib/searchMapStores.js');

  const listings = [
    {
      id: 'car-1',
      ownerId: 'owner-1',
      maker: 'Toyota',
      model: 'Aqua',
      cls: 'compact',
      loc: 'KIX Counter',
      priceDay: 7000,
      listingType: 'specific',
      holder: { name: 'Best KIX' },
    },
    {
      id: 'rof-owner-1-compact',
      ownerId: 'owner-1',
      targetClass: 'compact',
      loc: 'KIX Counter',
      priceDay: 6500,
      classAvailable: 2,
      listingType: 'class_based',
      maker: 'Best KIX',
    },
    {
      id: 'car-2',
      ownerId: 'owner-2',
      maker: 'Nissan',
      model: 'Serena',
      cls: 'minivan',
      loc: 'Naha Airport',
      priceDay: 9000,
      listingType: 'specific',
      holder: { name: 'Best Naha' },
    },
  ];

  const groups = buildStoreMapGroups({
    listings,
    coordsById: {
      'car-1': [34.432, 135.230],
      'rof-owner-1-compact': [34.433, 135.231],
      'car-2': [26.212, 127.681],
    },
  });

  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, 'store-owner-1-kix-counter');
  assert.equal(groups[0].name, 'Best KIX');
  assert.equal(groups[0].listingCount, 2);
  assert.equal(groups[0].specificCount, 1);
  assert.equal(groups[0].classPlanCount, 1);
  assert.equal(groups[0].classAvailable, 2);
  assert.equal(groups[0].minPriceDay, 6500);
  assert.deepEqual(groups[0].listings.map(v => v.id), ['rof-owner-1-compact', 'car-1']);
  assert.equal(groups[1].id, 'store-owner-2-naha-airport');
});

test('store map falls back to owner names when listing holder names are absent', async () => {
  const { buildStoreMapGroups } = await import('../lib/searchMapStores.js');

  const groups = buildStoreMapGroups({
    listings: [
      {
        id: 'car-owner-name',
        ownerId: 'owner-name',
        ownerName: 'Owner Name Store',
        maker: 'Toyota',
        model: 'Yaris',
        cls: 'compact',
        loc: 'Tokyo Station',
        priceDay: 6800,
        listingType: 'specific',
      },
    ],
    coordsById: {
      'car-owner-name': [35.6812, 139.7671],
    },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Owner Name Store');
});

test('store map uses approved owner registration data for public store labels', async () => {
  const { buildStoreMapGroups } = await import('../lib/searchMapStores.js');

  const groups = buildStoreMapGroups({
    owners: [
      {
        id: 'owner-registered',
        userId: 'auth-owner-registered',
        storeName: 'Registered KIX Store',
        storeLocation: 'KIX Registered Counter',
        status: 'approved',
      },
    ],
    listings: [
      {
        id: 'car-registered-store',
        ownerAuthId: 'auth-owner-registered',
        maker: 'Toyota',
        model: 'Aqua',
        cls: 'compact',
        loc: 'KIX Counter',
        priceDay: 7200,
        listingType: 'specific',
      },
    ],
    coordsById: {
      'car-registered-store': [34.432, 135.230],
    },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'store-owner-registered-kix-registered-counter');
  assert.equal(groups[0].ownerId, 'owner-registered');
  assert.equal(groups[0].name, 'Registered KIX Store');
  assert.equal(groups[0].location, 'KIX Registered Counter');
});

test('map search defaults to store pins and preserves vehicle pin mode', () => {
  const mapSearch = read('components/MapSearch.jsx');
  const context = read('lib/context.jsx');
  const dataRoute = read('app/api/data/route.js');

  assert.match(mapSearch, /buildStoreMapGroups/);
  assert.match(mapSearch, /owners = \[\]/);
  assert.match(mapSearch, /buildClassVirtualListings\(\{ vehicles, reservations, owners, pickup, ret, selectedClass: cls, airportCode \}\)/);
  assert.match(mapSearch, /buildStoreMapGroups\(\{ listings: results, coordsById, owners \}\)/);
  assert.match(mapSearch, /const \[mapMode, setMapMode\] = useState\('stores'\)/);
  assert.match(mapSearch, /mapMode === 'stores'/);
  assert.match(mapSearch, /effectiveMapMode = mapMode === 'stores' && storeGroups\.length === 0 && results\.length > 0/);
  assert.match(mapSearch, /effectiveMapMode === btn\.v/);
  assert.match(mapSearch, /selectedStore/);
  assert.match(mapSearch, /StoreSelectedCard/);
  assert.match(mapSearch, /setMapMode\('vehicles'\)/);
  assert.match(mapSearch, /ms_storePins/);
  assert.match(mapSearch, /ms_vehiclePins/);

  assert.match(context, /owners:\s+\[\]/);
  assert.match(context, /owners:\s+action\.data\.owners\s+\?\? state\.owners/);
  assert.match(dataRoute, /owners:\s+\(oRes\.data \?\? \[\]\)/);
  assert.match(dataRoute, /function dbToOwnerStore/);
});
