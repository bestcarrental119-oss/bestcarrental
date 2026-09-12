import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('review API exposes renter and owner profile summaries from revealed reviews', () => {
  const reviewsApi = read('app/api/reviews/route.js');
  const myPage = read('components/MyPage.jsx');
  const ownerDashboard = read('components/OwnerDashboard.jsx');

  assert.match(reviewsApi, /const ownerId\s+=\s+searchParams\.get\('ownerId'\)/);
  assert.match(reviewsApi, /getReviewsForOwner\(ownerId\)/);
  assert.match(reviewsApi, /buildReviewProfile/);
  assert.match(reviewsApi, /avgRating/);
  assert.match(reviewsApi, /reviewCount/);
  assert.match(reviewsApi, /visibleReviews/);
  assert.match(reviewsApi, /reviewerRole !== 'customer' && reviewerRole !== 'host'/);
  assert.match(myPage, /reviewProfile/);
  assert.match(myPage, /\/api\/reviews\?userId=\$\{currentUser\.id\}/);
  assert.match(myPage, /オーナーからの評価/);
  assert.match(ownerDashboard, /ownerReviewProfile/);
  assert.match(ownerDashboard, /\/api\/reviews\?ownerId=\$\{owner\.id\}/);
  assert.match(ownerDashboard, /店舗プロフィール評価/);
  assert.match(myPage, /revieweeId=\{reviewTarget\.reservation\.ownerId/);
});

test('owner can inspect renter reputation on each reservation before deciding', () => {
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const renterReviewsApi = read('app/api/owner/renter-reviews/route.js');

  assert.match(renterReviewsApi, /resolveOwnerLookupIds/);
  assert.match(renterReviewsApi, /owner_auth_id/);
  assert.match(renterReviewsApi, /recentReviews/);
  assert.match(renterReviewsApi, /reviewerOwnerName/);
  assert.match(ownerDashboard, /renterReviewData/);
  assert.match(ownerDashboard, /RenterTrustSnapshot/);
  assert.match(ownerDashboard, /previous reviews from other owners/i);
  assert.match(ownerDashboard, /decideReservation/);
  assert.match(ownerDashboard, /貸し出す/);
  assert.match(ownerDashboard, /貸し出さない/);
});

test('owner reservation decision endpoint verifies ownership and records approval or rejection', () => {
  assert.ok(existsSync(new URL('../app/api/owner/reservations/[id]/decision/route.js', import.meta.url)));
  const decisionApi = read('app/api/owner/reservations/[id]/decision/route.js');
  const shared = read('components/Shared.jsx');

  assert.match(decisionApi, /resolveOwnerLookupIds/);
  assert.match(decisionApi, /Vehicle owner mismatch|Reservation owner mismatch/);
  assert.match(decisionApi, /action === 'approve'/);
  assert.match(decisionApi, /status: 'confirmed'/);
  assert.match(decisionApi, /action === 'reject'/);
  assert.match(decisionApi, /status: 'rejected'/);
  assert.match(decisionApi, /ownerDecision/);
  assert.match(decisionApi, /refund_required|refunded/);
  assert.match(decisionApi, /AUTHORIZED_PAYMENT_STATUS/);
  assert.match(decisionApi, /paymentIntents\.cancel/);
  assert.match(decisionApi, /release_required|RELEASED_PAYMENT_STATUS/);
  assert.match(shared, /rejected:\s+\['bg-red-900\/40 text-red-300',\s+'Rejected'\]/);
});
