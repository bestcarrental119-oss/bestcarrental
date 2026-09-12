import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('availability calendar API uses the same overlap window as reservation check', () => {
  const availabilityApi = read('app/api/vehicle-availability/route.js');
  const checkApi = read('app/api/reservations/check/route.js');

  assert.match(checkApi, /\.lt\('pickup_at', ret\)/);
  assert.match(checkApi, /\.gt\('return_at', pickup\)/);
  assert.match(availabilityApi, /monthStartIso/);
  assert.match(availabilityApi, /monthEndIso/);
  assert.match(availabilityApi, /\.lt\('pickup_at', monthEndIso\)/);
  assert.match(availabilityApi, /\.gt\('return_at', monthStartIso\)/);
  assert.match(availabilityApi, /"cancelled","canceled","rejected"/);
});

test('booking and owner calendars provide explicit future month selection', () => {
  const bookingCalendar = read('components/AvailabilityCalendar.jsx');
  const ownerCalendar = read('components/OwnerCalendar.jsx');

  assert.match(bookingCalendar, /type="month"/);
  assert.match(bookingCalendar, /handleMonthInput/);
  assert.match(ownerCalendar, /type="month"/);
  assert.match(ownerCalendar, /handleMonthInput/);
});

test('booking modal gets major booking labels from i18n', () => {
  const bookingModal = read('components/BookingModal.jsx');
  const i18n = read('lib/i18n.js');

  assert.match(i18n, /code: 'ja'/);
  assert.match(i18n, /bookingStepDateTime/);
  assert.match(i18n, /selectDates/);
  assert.match(i18n, /vehicleBooked/);
  assert.match(bookingModal, /useI18n/);
  assert.match(bookingModal, /bookingStepDateTime/);
  assert.match(bookingModal, /selectDates/);
  assert.match(bookingModal, /vehicleBooked/);
});
