import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('renter pickup QR is available from the reservation list immediately after booking creation', () => {
  const pickupRoute = read('app/api/pickup-pass/route.js');
  const myPage = read('components/MyPage.jsx');

  assert.match(pickupRoute, /PASS_ELIGIBLE_STATUSES/);
  assert.match(pickupRoute, /payment_pending/);
  assert.match(pickupRoute, /pending/);
  assert.match(myPage, /canOpenPickupPass/);
  assert.match(myPage, /payment_pending/);
});

test('reservation action buttons stay inside the card on mobile', () => {
  const myPage = read('components/MyPage.jsx');

  assert.match(myPage, /flex-col gap-4 sm:flex-row/);
  assert.match(myPage, /className="flex min-w-0 gap-4"/);
  assert.match(myPage, /className="min-w-0"/);
  assert.match(myPage, /grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-col/);
  assert.match(myPage, /min-h-9 w-full/);
});
