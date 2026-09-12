import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('reservation API broadcasts new reservations to the owning user account', () => {
  const reservationsApi = read('app/api/reservations/route.js');

  assert.match(reservationsApi, /OWNER_RESERVATION_NOTIFY_STATUSES/);
  assert.match(reservationsApi, /function shouldNotifyOwnerReservation/);
  assert.match(reservationsApi, /async function resolveReservationOwnerRecipient/);
  assert.match(reservationsApi, /\.from\('owners'\)\s*\.select\('id, user_id, store_name, email, booking_email_contact'\)/);
  assert.match(reservationsApi, /recipientId:\s*owner\?\.user_id \?\? reservation\.owner_id/);
  assert.match(reservationsApi, /channel\(`notify:\$\{recipientId\}`\)/);
  assert.match(reservationsApi, /event:\s*'new_reservation'/);
  assert.match(reservationsApi, /status === 'payment_pending'/);
  assert.match(reservationsApi, /phase === 'create' && status === 'pending_assignment'/);
  assert.match(reservationsApi, /await notifyOwnerReservation\(data, \{ phase: 'create' \}\)/);
  assert.match(reservationsApi, /await notifyOwnerReservation\(result\.data, \{ phase: 'create' \}\)/);
  assert.match(reservationsApi, /await notifyOwnerReservation\(saved, \{ phase: 'finalize' \}\)/);
});

test('reservation API emails the owner when a store receives a reservation', () => {
  const reservationsApi = read('app/api/reservations/route.js');

  assert.match(reservationsApi, /import \{ sendEmail \}/);
  assert.match(reservationsApi, /function extractEmail/);
  assert.match(reservationsApi, /function escapeHtml/);
  assert.match(reservationsApi, /async function sendOwnerReservationEmail/);
  assert.match(reservationsApi, /email:\s*extractEmail\(owner\?\.email\) \|\| extractEmail\(owner\?\.booking_email_contact\)/);
  assert.match(reservationsApi, /subject:\s*`新しい予約が入りました - \$\{storeName\}`/);
  assert.match(reservationsApi, /reservationOwnerMessage\(reservation, storeName\)/);
  assert.match(reservationsApi, /await sendEmail\(/);
  assert.match(reservationsApi, /await sendOwnerReservationEmail\(reservation, recipient\)/);
});

test('owner dashboard receives reservation notifications for every store on the account', () => {
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const page = read('app/page.jsx');

  assert.match(ownerDashboard, /event:\s*'new_reservation'/);
  assert.match(ownerDashboard, /const payloadOwnerId = payload\?\.payload\?\.ownerId/);
  assert.match(ownerDashboard, /String\(payloadOwnerId\) === String\(owner\?\.id\)/);
  assert.match(ownerDashboard, /kind:\s*'ownerReservations'/);
  assert.match(ownerDashboard, /new Notification\('新しい予約'/);
  assert.match(ownerDashboard, /新しい予約が入りました/);
  assert.match(page, /a\.kind === 'ownerReservations'/);
  assert.match(page, /SET_OWNER_TAB', v: 'reservations'/);
});
