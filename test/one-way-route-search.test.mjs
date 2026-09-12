import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readProjectFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('route search resolves multilingual nearby area names', async () => {
  const { resolveAreaPreset } = await import('../lib/oneWay.js');

  assert.equal(resolveAreaPreset('関空付近')?.id, 'kix');
  assert.equal(resolveAreaPreset('KIX')?.id, 'kix');
  assert.equal(resolveAreaPreset('大阪市内')?.id, 'osaka-umeda');
  assert.equal(resolveAreaPreset('Osaka city')?.id, 'osaka-umeda');
  assert.equal(resolveAreaPreset('京都付近')?.id, 'kyoto-station');
  assert.equal(resolveAreaPreset('关西机场')?.id, 'kix');
  assert.equal(resolveAreaPreset('東京付近')?.id, 'tokyo-station');
  assert.equal(resolveAreaPreset('成田')?.id, 'narita-airport');
  assert.equal(resolveAreaPreset('福岡')?.id, 'fukuoka-airport');
  assert.equal(resolveAreaPreset('北海道')?.id, 'hokkaido-sapporo');
  assert.equal(resolveAreaPreset('NRT')?.id, 'narita-airport');
  assert.equal(resolveAreaPreset('FUK')?.id, 'fukuoka-airport');
});

test('route search matches pickup from location and return destination together', async () => {
  const { resolveAreaPreset, searchRouteListings } = await import('../lib/oneWay.js');
  const pickupPoint = resolveAreaPreset('関空付近');
  const returnPoint = resolveAreaPreset('大阪市内');
  const listings = [
    {
      id: 'kix-to-osaka',
      maker: 'Toyota',
      model: 'Noah',
      from: { name: 'KIX', lat: 34.4342, lng: 135.2441 },
      to: { name: 'Umeda', lat: 34.7025, lng: 135.4959 },
      basePrice: 2200,
    },
    {
      id: 'kix-to-kyoto',
      maker: 'Honda',
      model: 'Fit',
      from: { name: 'KIX', lat: 34.4342, lng: 135.2441 },
      to: { name: 'Kyoto', lat: 34.9858, lng: 135.7588 },
      basePrice: 1800,
    },
    {
      id: 'kyoto-to-osaka',
      maker: 'Nissan',
      model: 'Serena',
      from: { name: 'Kyoto', lat: 34.9858, lng: 135.7588 },
      to: { name: 'Umeda', lat: 34.7025, lng: 135.4959 },
      basePrice: 1600,
    },
  ];

  const result = searchRouteListings(listings, { pickupPoint, returnPoint });

  assert.equal(result.radiusKm, 20);
  assert.deepEqual(result.listings.map(x => x.id), ['kix-to-osaka']);
  assert.ok(result.listings[0].routeSearch.pickupDistanceKm < 1);
  assert.ok(result.listings[0].routeSearch.returnDistanceKm < 1);
});

test('route search expands radius instead of requiring exact addresses', async () => {
  const { searchRouteListings } = await import('../lib/oneWay.js');
  const result = searchRouteListings([
    {
      id: 'nearby-ish',
      from: { name: 'Rinku Town', lat: 34.4100, lng: 135.3000 },
      to: { name: 'Namba', lat: 34.6654, lng: 135.5019 },
      basePrice: 2000,
    },
  ], {
    pickupPoint: { lat: 34.4342, lng: 135.2441 },
    returnPoint: { lat: 34.7025, lng: 135.4959 },
    radiiKm: [5, 20, 50],
  });

  assert.equal(result.radiusKm, 20);
  assert.equal(result.expanded, true);
  assert.equal(result.listings[0].id, 'nearby-ish');
});

test('route search candidates can be narrowed by date and vehicle class', async () => {
  const { filterRouteSearchCandidates } = await import('../lib/oneWay.js');
  const listings = [
    { id: 'match', cls: 'minivan', availableFrom: '2026-08-01T09:00:00.000Z', deadlineAt: '2026-08-04T10:00:00.000Z' },
    { id: 'wrong-class', cls: 'kei', availableFrom: '2026-08-01T09:00:00.000Z', deadlineAt: '2026-08-04T10:00:00.000Z' },
    { id: 'too-late', cls: 'minivan', availableFrom: '2026-08-05T09:00:00.000Z', deadlineAt: '2026-08-07T10:00:00.000Z' },
    { id: 'expired', cls: 'minivan', availableFrom: '2026-07-25T09:00:00.000Z', deadlineAt: '2026-07-31T10:00:00.000Z' },
  ];

  const result = filterRouteSearchCandidates(listings, {
    selectedClass: 'minivan',
    pickupDate: '2026-08-02',
    returnDate: '2026-08-03',
  });

  assert.deepEqual(result.map(x => x.id), ['match']);
});

test('one-way listings hide and reject cars that are still in transit', async () => {
  const { listingReadyForSearch, listingReadyForReservation } = await import('../lib/oneWay.js');
  const listingsRoute = readProjectFile('app/api/one-way/listings/route.js');
  const reserveRoute = readProjectFile('app/api/one-way/reserve/route.js');
  const sql = readProjectFile('supabase/SUPABASE_今回実行するSQL.sql');

  assert.equal(listingReadyForSearch({ status: 'open', custody_status: 'in_transit' }), false);
  assert.equal(listingReadyForSearch({ status: 'open', custodyStatus: 'received' }), true);
  assert.equal(listingReadyForSearch({ status: 'open' }), true);
  assert.equal(listingReadyForReservation({ status: 'open', custody_status: 'handover_pending' }), false);
  assert.equal(listingReadyForReservation({ status: 'reserved', custody_status: 'received' }), false);

  assert.match(listingsRoute, /listingReadyForSearch/);
  assert.match(listingsRoute, /\.filter\(listingReadyForSearch\)/);
  assert.match(reserveRoute, /listingReadyForReservation/);
  assert.match(reserveRoute, /Listing is not ready for pickup/);
  assert.match(sql, /custody_status TEXT DEFAULT 'received'/);
});

test('route rental base amount uses selected search days', async () => {
  const { routeRentalBaseAmount, routeRentalDays } = await import('../lib/oneWay.js');
  const search = { pickupDate: '2026-08-01', returnDate: '2026-08-04' };

  assert.equal(routeRentalDays(search), 3);
  assert.equal(routeRentalBaseAmount({ basePrice: 9000 }, search), 27000);
  assert.equal(routeRentalBaseAmount({ priceDay: 8000 }, search), 24000);
  assert.equal(routeRentalBaseAmount({ basePrice: 9000 }, { pickupDate: '', returnDate: '' }), 9000);
});

test('route result cards and one-way reservation use selected-day rental amount separately from Best Go fee', () => {
  const explorer = readProjectFile('components/oneway/UserMapExplorer.jsx');
  const reservation = readProjectFile('components/oneway/ReservationModal.jsx');
  const reserveApi = readProjectFile('app/api/one-way/reserve/route.js');

  assert.match(explorer, /routeRentalBaseAmount\(listing, search\)/);
  assert.match(explorer, /search=\{\{ pickupDate, returnDate \}\}/);
  assert.match(explorer, /rentalDays=\{rentalDays\}/);
  assert.match(reservation, /routeRentalBaseAmount\(listing, search, fallbackDays\)/);
  assert.match(reservation, /base: rentalBaseAmount/);
  assert.match(reserveApi, /rentalDaysBetween/);
  assert.match(reserveApi, /baseAmount/);
});

test('shared map explorer exposes route search for Best One-Way and Best Go', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');

  assert.match(source, /searchRouteListings/);
  assert.match(source, /ONE_WAY_AREA_PRESETS/);
  assert.match(source, /ow_pickupArea/);
  assert.match(source, /ow_returnArea/);
  assert.match(source, /ow_searchStepLocation/);
  assert.match(source, /ow_searchStepDates/);
  assert.match(source, /ow_searchStepClass/);
  assert.match(source, /selectedClass/);
  assert.match(source, /activeTargetRef/);
  assert.match(source, /ow_mapPickMode/);
});

test('map results render every matched route as selectable vehicle cards', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');

  assert.match(source, /function RouteListingCard/);
  assert.match(source, /function RouteResultsPanel/);
  assert.match(source, /ow_resultsListTitle/);
  assert.match(source, /listings\.map\(listing => \(/);
  assert.match(source, /select\(listing, window\.google\)/);
  assert.match(source, /<RouteResultsPanel/);
  assert.doesNotMatch(source, /function RouteResultsSheet/);
  assert.doesNotMatch(source, /<DetailSheet listing=\{selected\}/);
});

test('route result cards stay outside the map and map routes keep visible arrows', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');

  assert.match(source, /routeLinesRef/);
  assert.match(source, /drawRouteLines/);
  assert.match(source, /FORWARD_CLOSED_ARROW/);
  assert.doesNotMatch(source, /absolute inset-x-0 bottom-0/);
  assert.match(source, /<RouteResultsPanel[\s\S]*listings=\{visibleListings\}/);
});

test('mobile route results use a compact horizontal card rail so the map remains visible', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');

  assert.match(source, /snap-x/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /min-w-\[82%\]/);
  assert.match(source, /h-\[50dvh\]/);
  assert.doesNotMatch(source, /max-h-\[48vh\] space-y-2 overflow-y-auto/);
});

test('mobile route result rail has explicit previous next navigation and position dots', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');

  assert.match(source, /const railRef = useRef\(null\)/);
  assert.match(source, /goResultCard/);
  assert.match(source, /aria-label="previous result car"/);
  assert.match(source, /aria-label="next result car"/);
  assert.match(source, /activeIndex \+ 1/);
  assert.match(source, /listings\.map\(\(_, index\) => \(/);
  assert.match(source, /onClick=\{\(\) => goResultCard\(index\)\}/);
});

test('Best Go popular area chips wrap on mobile instead of clipping off screen', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');
  const popularStart = source.indexOf("t('ow_popularAreas')");
  const popularSource = source.slice(popularStart, source.indexOf('setFlowStep', popularStart));

  assert.ok(popularStart > 0);
  assert.match(popularSource, /flex flex-wrap gap-2/);
  assert.match(popularSource, /whitespace-normal/);
  assert.doesNotMatch(popularSource, /overflow-x-auto/);
});

test('Best Go location entry shows a map and separates pickup and return presets', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');
  const locationStart = source.indexOf("flowStep === 'location'");
  const locationSource = source.slice(locationStart, source.indexOf("flowStep === 'dates'", locationStart));

  assert.ok(locationStart > 0);
  assert.match(source, /const locationMapDiv = useRef\(null\)/);
  assert.match(source, /data-oneway-location-map/);
  assert.match(source, /target === 'pickup' \? pickupInputRef\.current : returnInputRef\.current/);
  assert.match(source, /input\.focus\(\)/);
  assert.match(source, /reverseGeocode/);
  assert.match(locationSource, /data-location-field="pickup"/);
  assert.match(locationSource, /data-location-field="return"/);
  assert.match(locationSource, /applyPoint\('pickup', pointFromPreset\(preset, locale\)\)/);
  assert.match(locationSource, /applyPoint\('return', pointFromPreset\(preset, locale\)\)/);
  assert.doesNotMatch(locationSource, /applyPoint\(activeTarget,/);
});

test('Best Go date entry uses a range calendar and requires dates before booking', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');
  const reservation = readProjectFile('components/oneway/ReservationModal.jsx');
  const datesStart = source.indexOf("flowStep === 'dates'");
  const datesSource = source.slice(datesStart, source.indexOf("flowStep === 'class'", datesStart));

  assert.ok(datesStart > 0);
  assert.match(source, /const \[calendarMonth, setCalendarMonth\] = useState/);
  assert.match(source, /const dateSelectionComplete = Boolean\(pickupDate && returnDate && returnDate > pickupDate\)/);
  assert.match(source, /if \(!dateSelectionComplete\)/);
  assert.match(source, /data-oneway-date-calendar/);
  assert.match(source, /selectCalendarDate\(day\.value\)/);
  assert.match(datesSource, /calendarDays\.map/);
  assert.match(datesSource, /addMonthsToMonth\(calendarMonth, -1\)/);
  assert.match(datesSource, /addMonthsToMonth\(calendarMonth, 1\)/);
  assert.doesNotMatch(datesSource, /type="date"/);
  assert.match(source, /const hasRunnableSearch = Boolean\(dateSelectionComplete/);
  assert.match(reservation, /dateConfirmationTitle/);
  assert.doesNotMatch(reservation, /type="date"/);
  assert.doesNotMatch(reservation, /datetime-local/);
});

test('Best Go vehicle class selection uses the same illustrated class cards as normal booking', () => {
  const source = readProjectFile('components/oneway/UserMapExplorer.jsx');
  const classStart = source.indexOf("flowStep === 'class'");
  const classSource = source.slice(classStart, source.indexOf('routeError', classStart));

  assert.ok(classStart > 0);
  assert.doesNotMatch(source, /ONE_WAY_CLASS_GUIDES/);
  assert.match(readProjectFile('lib/data.js'), /img: '\/class-all\.jpg'/);
  assert.match(readProjectFile('lib/data.js'), /img: '\/classes\/kei-car\.png'/);
  assert.match(readProjectFile('lib/data.js'), /img: '\/classes\/compact-car\.png'/);
  assert.match(classSource, /data-oneway-class-card/);
  assert.match(classSource, /<img src=\{c\.img\}/);
  assert.match(classSource, /loading="lazy"/);
  assert.match(classSource, /onError=\{\(e\) => \{ e\.currentTarget\.style\.display = 'none'; \}\}/);
  assert.match(classSource, /h-28 w-full object-cover/);
  assert.doesNotMatch(classSource, /guide\.image/);
});

test('route map spreads overlapping listing points so every matched car has a visible pin', async () => {
  const { spreadRoutePoints } = await import('../lib/oneWay.js');
  const listings = [
    { id: 'a', from: { name: 'same', lat: 34.4186, lng: 135.3324 } },
    { id: 'b', from: { name: 'same', lat: 34.4186, lng: 135.3324 } },
    { id: 'c', from: { name: 'same', lat: 34.4186, lng: 135.3324 } },
    { id: 'd', from: { name: 'same', lat: 34.4186, lng: 135.3324 } },
  ];

  const points = spreadRoutePoints(listings, 'from');
  const unique = new Set(Object.values(points).map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`));

  assert.equal(Object.keys(points).length, 4);
  assert.equal(unique.size, 4);
  assert.deepEqual(listings[0].from, { name: 'same', lat: 34.4186, lng: 135.3324 });
});

test('cross-location return booth is branded as Best Go', () => {
  const source = readProjectFile('lib/i18n.js');

  assert.match(source, /cr_boothTitle: 'Best Go'/);
  assert.match(source, /cr_boothEmpty: '.*Best Go/);
});

test('home page prioritizes main search before Best One-Way and Best Go promos', () => {
  const source = readProjectFile('components/FrontendApp.jsx');
  const mainSearch = source.indexOf('Main search first');
  const oneWayPromo = source.indexOf('<OneWayBanner />');
  const bestGoPromo = source.indexOf('/best-go-icon.png');

  assert.ok(mainSearch > 0);
  assert.ok(oneWayPromo > mainSearch);
  assert.ok(bestGoPromo > mainSearch);
});

test('Best Go icon and loading art are wired into the app', () => {
  assert.match(readProjectFile('components/FrontendApp.jsx'), /best-go-icon\.png/);
  assert.match(readProjectFile('components/CrossReturnBooth.jsx'), /best-go-icon\.png/);
  assert.match(readProjectFile('components/CrossReturnBooth.jsx'), /loading-best-go\.png/);
  assert.match(readProjectFile('components/AppLoader.jsx'), /loading-cover\.jpg/);
  assert.doesNotMatch(readProjectFile('components/AppLoader.jsx'), /loading-best-go\.png/);
  assert.doesNotMatch(readProjectFile('components/FrontendApp.jsx'), /<LoaderOverlay src="\/loading-best-go\.png" \/>/);
});

test('Best One-Way loading art stays visible until page content is ready', () => {
  const page = readProjectFile('components/oneway/OneWayPage.jsx');

  assert.match(page, /import LoaderOverlay from '\.\.\/LoaderOverlay'/);
  assert.match(page, /loading && \(/);
  assert.match(page, /<LoaderOverlay src="\/loading-oneway\.jpg" \/>/);
  assert.match(page, /!loading && \(/);
  assert.match(page, /<UserMapExplorer listings=\{listings\}/);
  assert.doesNotMatch(page, /py-20 text-center text-sm text-gray-400">…<\/div>/);
});

test('Best One-Way and Best Go pages clear the fixed app header before the step pills', () => {
  const oneWayPage = readProjectFile('components/oneway/OneWayPage.jsx');
  const bestGoPage = readProjectFile('components/CrossReturnBooth.jsx');

  assert.match(readProjectFile('components/FrontendApp.jsx'), /<header className="app-header fixed top-0/);
  assert.match(oneWayPage, /className="[^"]*pt-appbar-lg[^"]*"/);
  assert.match(bestGoPage, /className="[^"]*pt-appbar-lg[^"]*"/);
  assert.doesNotMatch(oneWayPage, /px-4 pb-24 pt-4/);
  assert.doesNotMatch(bestGoPage, /px-4 pb-24 pt-4/);
});
