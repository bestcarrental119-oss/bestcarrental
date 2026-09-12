import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('booking requires a logged-in account before opening checkout', () => {
  const front = read('components/FrontendApp.jsx');
  const rof = read('components/RunOfFleetCard.jsx');

  assert.match(front, /if \(!currentUser\)/);
  assert.match(front, /mode: 'register'/);
  assert.match(rof, /if \(!state\.currentUser\)/);
  assert.match(rof, /mode: 'register'/);
});

test('booking profile requires IDP expiry, IDP upload, and at least one SNS channel', () => {
  const booking = read('components/BookingModal.jsx');

  assert.match(booking, /requiredBookingInfo/);
  assert.match(booking, /idpExpiresOn/);
  assert.match(booking, /idpFileDataUrl/);
  assert.match(booking, /hasSavedIdpFile/);
  assert.match(booking, /hasContactChannel/);
  assert.match(booking, /saveBookingProfile/);
  assert.match(booking, /Luggage capacity is an estimate/);
  assert.match(booking, /step === 5 && payError/);
});

test('booking profile sync never stores bulky IDP file data or blocks checkout', () => {
  const booking = read('components/BookingModal.jsx');
  const profileBlock = booking.slice(
    booking.indexOf('const profile = {'),
    booking.indexOf('const { error } = await supabase.auth.updateUser'),
  );

  assert.match(profileBlock, /idpFileStored/);
  assert.doesNotMatch(profileBlock, /idpFileDataUrl/);
  assert.match(booking, /saveBookingProfile\(\)\.catch/);
});

test('vehicle luggage capacity is captured, persisted, and rendered', () => {
  const owner = read('components/OwnerDashboard.jsx');
  const front = read('components/FrontendApp.jsx');
  const vehiclesApi = read('app/api/vehicles/route.js');
  const dataApi = read('app/api/data/route.js');

  for (const source of [owner, front, vehiclesApi, dataApi]) {
    assert.match(source, /largeSuitcases|large_suitcases/);
    assert.match(source, /smallBags|small_bags/);
  }
});

test('reservation finance records Stripe paid amount and owner fee settings', () => {
  const reservationsApi = read('app/api/reservations/route.js');
  const admin = read('components/AdminApp.jsx');
  const ownersApi = read('app/api/owners/route.js');

  assert.match(reservationsApi, /loadStripePaidAmount/);
  assert.match(reservationsApi, /stripe_paid_amount/);
  assert.match(reservationsApi, /sendReservationConfirmationEmail/);
  assert.match(admin, /platformFeePercent/);
  assert.match(admin, /ownerPayout/);
  assert.match(ownersApi, /platform_fee_percent/);
  assert.match(ownersApi, /owner_code/);
});

test('Supabase migration documents required production columns', () => {
  const sql = read('supabase/migrations/20260606_booking_identity_finance.sql');

  for (const column of [
    'large_suitcases',
    'small_bags',
    'booking_email_contact',
    'owner_code',
    'platform_fee_percent',
    'stripe_paid_amount',
    'confirmation_email_sent_at',
  ]) {
    assert.match(sql, new RegExp(column), `missing ${column}`);
  }
});
