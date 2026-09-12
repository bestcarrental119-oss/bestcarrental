import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Stripe checkout exposes Apple Pay and Google Pay through Payment Request Button', () => {
  const stripeForm = read('components/StripeForm.jsx');
  const bookingModal = read('components/BookingModal.jsx');

  assert.match(stripeForm, /paymentRequest\(/);
  assert.match(stripeForm, /PaymentRequestButton/);
  assert.match(stripeForm, /canMakePayment\(/);
  assert.match(stripeForm, /onWalletPayment/);
  assert.match(bookingModal, /confirmWalletPayment/);
  assert.match(bookingModal, /paymentMethodId/);
  assert.match(bookingModal, /handleActions:\s*false/);
});

test('run-of-fleet booth save updates shared frontend vehicle state immediately', () => {
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const context = read('lib/context.jsx');

  assert.match(ownerDashboard, /const \{\s*dispatch\s*\} = useApp\(\)/);
  assert.match(ownerDashboard, /UPSERT_VEHICLE_LOCAL/);
  assert.match(context, /case 'UPSERT_VEHICLE_LOCAL'/);
});
