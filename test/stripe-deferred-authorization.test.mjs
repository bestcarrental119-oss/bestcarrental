import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('cancellation policy can be calculated against an explicit current time', async () => {
  const { calcCancelFeeForTime } = await import('../lib/paymentAuthorization.js');
  const pickup = '2026-08-10T10:00:00+09:00';
  const base = 100000;

  assert.equal(calcCancelFeeForTime(base, pickup, new Date('2026-08-03T09:00:00+09:00')), 0);
  assert.equal(calcCancelFeeForTime(base, pickup, new Date('2026-08-04T09:00:00+09:00')), 30000);
  assert.equal(calcCancelFeeForTime(base, pickup, new Date('2026-08-09T09:00:00+09:00')), 50000);
  assert.equal(calcCancelFeeForTime(base, pickup, new Date('2026-08-10T09:00:00+09:00')), 80000);
  assert.equal(calcCancelFeeForTime(base, pickup, new Date('2026-08-10T10:01:00+09:00')), 100000);
});

test('7-day cron creates a manual-capture authorization instead of charging immediately', () => {
  const cron = read('app/api/cron/charge-due/route.js');
  const helper = read('lib/paymentAuthorization.js');

  assert.match(cron, /buildReservationAuthorizationIntentParams/);
  assert.match(helper, /capture_method:\s*'manual'/);
  assert.match(helper, /request_extended_authorization:\s*'if_available'/);
  assert.match(cron, /payment_status:\s*AUTHORIZED_PAYMENT_STATUS/);
  assert.doesNotMatch(cron, /payment_status:\s*'paid'[\s\S]*charged\+\+/);
  assert.match(cron, /idempotencyKey/);
});

test('normal reservation cancellation captures only the policy fee from an authorization', () => {
  const cancel = read('app/api/cancel/route.js');

  assert.match(cancel, /AUTHORIZED_PAYMENT_STATUS/);
  assert.match(cancel, /paymentIntents\.capture/);
  assert.match(cancel, /amount_to_capture:\s*Math\.round\(cancelFee\)/);
  assert.match(cancel, /final_capture:\s*true/);
  assert.match(cancel, /paymentIntents\.cancel/);
  assert.match(cancel, /payment_status:\s*CANCEL_FEE_CAPTURED_PAYMENT_STATUS/);
});

test('normal reservation pickup has a server-side full capture endpoint', () => {
  assert.ok(existsSync(new URL('../app/api/reservations/capture/route.js', import.meta.url)));
  const capture = read('app/api/reservations/capture/route.js');

  assert.match(capture, /AUTHORIZED_PAYMENT_STATUS/);
  assert.match(capture, /paymentIntents\.capture/);
  assert.match(capture, /amount_to_capture:\s*Math\.round\(captureAmount\)/);
  assert.match(capture, /payment_status:\s*'paid'/);
  assert.match(capture, /idempotencyKey/);
});

test('authorized reservations can still generate pickup passes', () => {
  const pickupPass = read('app/api/pickup-pass/route.js');

  assert.match(pickupPass, /AUTHORIZED_PAYMENT_STATUS/);
  assert.match(pickupPass, /\['paid', 'scheduled', AUTHORIZED_PAYMENT_STATUS\]/);
});

test('master console can capture, release, and charge saved zero-yen authorization cards', () => {
  assert.ok(existsSync(new URL('../app/api/admin/authorizations/route.js', import.meta.url)));
  const route = read('app/api/admin/authorizations/route.js');
  const admin = read('components/AdminApp.jsx');

  assert.match(route, /import \{ isMasterUser \}/);
  assert.match(route, /async function assertMaster/);
  assert.match(route, /supabaseAdmin\.auth\.getUser\(token\)/);
  assert.match(route, /master session required/);
  assert.match(route, /requester mismatch/);
  assert.match(route, /const guard = await assertMaster\(req, requesterId\)/);
  assert.match(route, /cleanAmount/);
  assert.match(route, /action === 'release'/);
  assert.match(route, /action === 'capture'/);
  assert.match(route, /action === 'charge'/);
  assert.match(route, /paymentIntents\.retrieve/);
  assert.match(route, /paymentIntents\.capture/);
  assert.match(route, /amount_to_capture:\s*Math\.round\(amount\)/);
  assert.match(route, /paymentIntents\.cancel/);
  assert.match(route, /paymentIntents\.create/);
  assert.match(route, /off_session:\s*true/);
  assert.match(route, /confirm:\s*true/);
  assert.match(route, /payment_status:\s*'paid'/);
  assert.match(route, /RELEASED_PAYMENT_STATUS/);
  assert.match(route, /const settled = status === 'paid' \|\| status === RELEASED_PAYMENT_STATUS/);
  assert.match(route, /Only active authorization holds can be released/);

  assert.match(admin, /function MasterAuthorizationManager/);
  assert.match(admin, /import \{ supabase \}/);
  assert.match(admin, /masterSessionHeaders/);
  assert.match(admin, /Authorization: `Bearer \$\{token\}`/);
  assert.match(admin, /\/api\/admin\/authorizations/);
  assert.match(admin, /authActionAmounts/);
  assert.match(admin, /オーソリ管理/);
  assert.match(admin, /¥0カード請求/);
  assert.match(admin, /請求・キャプチャ/);
  assert.match(admin, /解放/);
  assert.match(admin, /canReleaseHold/);
  assert.match(admin, /<MasterAuthorizationManager/);
  assert.match(admin, /id:\s*'authorizations'/);
  assert.match(admin, /mst_navAuthorizations/);
  assert.match(admin, /renderedAdminTab === 'authorizations'/);
});
