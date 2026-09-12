import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('booking ids are collision-resistant and no longer use timestamp suffixes', () => {
  const booking = read('components/BookingModal.jsx');

  assert.match(booking, /function makeReservationId/);
  assert.match(booking, /crypto\.randomUUID/);
  assert.doesNotMatch(booking, /String\(Date\.now\(\)\)\.slice\(-4\)/);
});

test('booking saves a pending reservation before taking card payment', () => {
  const booking = read('components/BookingModal.jsx');
  const saveIndex = booking.indexOf('await saveReservationBeforePayment');
  const payIndex = booking.indexOf('confirmCardPayment');

  assert.ok(saveIndex > -1, 'expected reservation save helper to be used');
  assert.ok(payIndex > -1, 'expected Stripe card confirmation to remain');
  assert.ok(saveIndex < payIndex, 'reservation must be persisted before Stripe confirmation');
});

test('unimplemented wallet payment methods cannot create unpaid reservations', () => {
  const booking = read('components/BookingModal.jsx');

  assert.doesNotMatch(booking, /id: 'apple'/);
  assert.doesNotMatch(booking, /id: 'google'/);
  assert.doesNotMatch(booking, /id: 'paypal'/);
  assert.match(booking, /unsupportedPayment/);
});

test('failed card attempts cancel the temporary pending reservation', () => {
  const booking = read('components/BookingModal.jsx');

  assert.match(booking, /pendingReservationId/);
  assert.match(booking, /paymentSucceeded/);
  assert.match(booking, /status: 'cancelled'/);
});

test('booking availability and pending-review checks fail closed', () => {
  const booking = read('components/BookingModal.jsx');
  const reservationsApi = read('app/api/reservations/route.js');

  assert.match(booking, /availabilityCheckFailed/);
  assert.doesNotMatch(booking, /\/api\/reviews\?userId=\$\{currentUser\.id\}&checkPending=1/);
  assert.match(booking, /\/api\/reservations\?userId=\$\{currentUser\.id\}&checkPending=1/);
  assert.match(reservationsApi, /pendingCount/);
});

test('pending review gate ignores future, failed, and cancelled reservations', () => {
  const reservationsApi = read('app/api/reservations/route.js');

  assert.match(reservationsApi, /PENDING_REVIEW_STATUSES/);
  assert.match(reservationsApi, /returnDate > now/);
  assert.doesNotMatch(reservationsApi, /\.in\('status', \['completed', 'confirmed'\]\)/);
  assert.doesNotMatch(reservationsApi, /&& \['completed', 'confirmed'\]\.includes\(r\.status\)/);
});

test('my page labels and cancels class-based reservations', () => {
  const myPage = read('components/MyPage.jsx');
  const context = read('lib/context.jsx');

  assert.match(myPage, /classBasedReservationLabel/);
  assert.match(myPage, /bookingType === BOOKING_TYPES\.CLASS_BASED/);
  assert.match(myPage, /cancellableStatuses\.has\(r\.status\)/);
  assert.match(myPage, /reviewableStatuses\.has\(r\.status\)/);
  assert.match(myPage, /pending_assignment/);
  assert.match(context, /case 'UPDATE_RES'/);
  assert.match(context, /method: 'PATCH'/);
});

test('owner and admin revenue summaries include assignment state and pickup dates', () => {
  const owner = read('components/OwnerDashboard.jsx');
  const admin = read('components/AdminApp.jsx');

  assert.match(owner, /reservationDateOf/);
  assert.doesNotMatch(owner, /new Date\(r\.created_at\)\.getMonth\(\)/);
  assert.match(admin, /\['pending', 'pending_assignment'\]\.includes\(status\)/);
});

test('front page and run-of-fleet cards use i18n for key user-facing labels', () => {
  const front = read('components/FrontendApp.jsx');
  const rof = read('components/RunOfFleetCard.jsx');
  const i18n = read('lib/i18n.js');

  for (const key of ['howItWorksTitle', 'ownerPortal', 'vehicleCount', 'runOfFleetTitle', 'privacy', 'terms']) {
    assert.match(i18n, new RegExp(`${key}:`), `missing i18n key ${key}`);
  }
  assert.match(front, /t\('howItWorksTitle'\)/);
  assert.match(front, /t\('ownerPortal'\)/);
  assert.match(front, /t\('searchBtn'\)/);
  assert.match(rof, /useI18n/);
  assert.doesNotMatch(rof, /自動\/手動/);
});

test('preselected search dates become confirmation-only booking dates', () => {
  const booking = read('components/BookingModal.jsx');
  const mapSearch = read('components/MapSearch.jsx');
  const crossReturn = read('components/CrossReturnBooth.jsx');
  const oneWayPage = read('components/oneway/OneWayPage.jsx');
  const oneWayReservation = read('components/oneway/ReservationModal.jsx');
  const i18n = read('lib/i18n.js');

  assert.match(booking, /hasPresetDates/);
  assert.match(booking, /datePreset/);
  assert.match(booking, /dateConfirmationTitle/);
  assert.match(booking, /dateChangeCta/);
  assert.match(mapSearch, /datePreset: Boolean\(pickup && ret\)/);
  assert.match(crossReturn, /datePreset: Boolean\(pickupAt && returnAt\)/);
  assert.match(oneWayPage, /onReserve=\{\(listing, search\) => setReserveTarget\(\{ listing, search \}\)\}/);
  assert.match(oneWayReservation, /search = \{\}/);
  assert.match(oneWayReservation, /pickupDate/);
  assert.match(oneWayReservation, /returnDate/);
  assert.match(i18n, /dateConfirmationTitle:/);
  assert.match(i18n, /dateChangeCta:/);
});
