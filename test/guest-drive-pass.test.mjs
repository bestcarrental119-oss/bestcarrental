import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('vehicle booking requires an account before checkout starts', () => {
  const frontend = read('components/FrontendApp.jsx');
  const bookingStart = frontend.match(/const openBooking = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(bookingStart, /SET_AUTH/);
  assert.match(bookingStart, /mode: 'register'/);
  assert.match(bookingStart, /return;/);
  assert.match(frontend, /guestName: ''/);
});

test('booking success upsells Japan Drive Pass and preserves guest booking context', () => {
  const booking = read('components/BookingModal.jsx');
  assert.match(booking, /BookingDrivePassUpsell/);
  assert.match(booking, /guestBookingToken/);
  assert.match(booking, /contactHandles/);
  assert.match(booking, /idpFileName/);
});

test('guest reservation can be linked to a newly created Drive Pass account', () => {
  assert.ok(existsSync(new URL('../app/api/reservations/link-guest/route.js', import.meta.url)));
  const linkApi = read('app/api/reservations/link-guest/route.js');
  assert.match(linkApi, /\.eq\('guest_booking_token', guestToken\)/);
  assert.match(linkApi, /\.eq\('guest_email', email\)/);
  assert.match(linkApi, /\.is\('user_id', null\)/);
});

test('Japan Drive Pass schema and user-facing components exist', () => {
  assert.ok(existsSync(new URL('../supabase/japan_drive_pass_schema.sql', import.meta.url)));
  assert.ok(existsSync(new URL('../components/JapanDrivePassCard.jsx', import.meta.url)));
  assert.ok(existsSync(new URL('../components/EmergencySupportHub.jsx', import.meta.url)));
  assert.ok(existsSync(new URL('../components/BookingDrivePassUpsell.jsx', import.meta.url)));

  const schema = read('supabase/japan_drive_pass_schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS japan_drive_passes/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS one_way_return_locations/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS itineraries/);
});

test('chat bubbles visibly distinguish guest/user and owner messages', () => {
  const chat = read('components/ChatModal.jsx');
  const owner = read('components/OwnerDashboard.jsx');
  assert.match(chat, /roleLabel/);
  assert.match(chat, /Owner/);
  assert.match(chat, /Guest/);
  assert.match(owner, /roleLabel/);
  assert.match(owner, /Owner/);
  assert.match(owner, /Guest/);
});

test('reservations persist owner id so owner dashboard can list new bookings', () => {
  const booking = read('components/BookingModal.jsx');
  const reservationsApi = read('app/api/reservations/route.js');
  const ownerReservationsApi = read('app/api/owner/reservations/route.js');
  const schema = read('supabase/japan_drive_pass_schema.sql');

  assert.match(booking, /ownerId:\s*v\.ownerId/);
  assert.match(read('lib/runOfFleet.js'), /ownerId:\s*ownerId \?\? ownerIdOf\(vehicle\)/);
  assert.match(reservationsApi, /owner_id:\s*r\.ownerId/);
  assert.match(ownerReservationsApi, /ownerLookupIds/);
  assert.match(ownerReservationsApi, /\.in\('owner_id', ownerLookupIds\)/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS owner_id UUID/);
});

test('admin can see reservation and revenue totals grouped by owner', () => {
  const admin = read('components/AdminApp.jsx');
  const i18n = read('lib/i18n.js');

  assert.match(admin, /owner-revenue/);
  assert.match(admin, /OwnerRevenueTab/);
  assert.match(admin, /buildOwnerRevenueRows/);
  assert.match(admin, /reservationCount/);
  assert.match(admin, /confirmedRevenue/);
  assert.match(admin, /totalRevenue/);
  assert.match(admin, /Owner Revenue/);
  assert.match(i18n, /ownerRevenue:\s*'Owner Revenue'/);
});

test('supabase auth session survives reload and navbar exposes login/logout actions', () => {
  const context = read('lib/context.jsx');
  const navbar = read('components/FrontendApp.jsx');

  assert.match(context, /supabase\.auth\.getSession\(\)/);
  assert.match(context, /supabase\.auth\.onAuthStateChange/);
  assert.match(context, /supabase\.auth\.signOut\(\)/);
  assert.match(context, /userFromSupabase/);
  assert.match(navbar, /SET_AUTH', open: true, mode: 'login'/);
  assert.match(navbar, /LOGOUT/);
  assert.match(navbar, /Sign Out/);
});
