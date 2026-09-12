import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('review submission broadcasts double-blind-safe review notifications', () => {
  const reviewsApi = read('app/api/reviews/route.js');

  assert.match(reviewsApi, /notifyReviewParticipants/);
  assert.match(reviewsApi, /resolveReviewNotificationActors/);
  assert.match(reviewsApi, /channel\(`notify:\$\{recipientId\}`\)/);
  assert.match(reviewsApi, /event:\s*'new_review'/);
  assert.match(reviewsApi, /review_prompt/);
  assert.match(reviewsApi, /review_revealed/);
  assert.match(reviewsApi, /レビューが届きました。あなたも評価を書きましょう。/);
  assert.match(reviewsApi, /レビューが公開されました。内容を確認できます。/);
  assert.doesNotMatch(reviewsApi, /payload:\s*\{[^}]*rating/s);
  assert.doesNotMatch(reviewsApi, /payload:\s*\{[^}]*comment/s);
});

test('user and owner shells listen for review notifications and open the right review area', () => {
  const frontend = read('components/FrontendApp.jsx');
  const ownerDashboard = read('components/OwnerDashboard.jsx');
  const page = read('app/page.jsx');

  assert.match(frontend, /event:\s*'new_review'/);
  assert.match(frontend, /kind:\s*'review'/);
  assert.match(ownerDashboard, /event:\s*'new_review'/);
  assert.match(ownerDashboard, /kind:\s*'ownerReviews'/);
  assert.match(page, /a\.kind === 'review'/);
  assert.match(page, /SET_MYPAGE_TAB', v: 'reservations'/);
  assert.match(page, /a\.kind === 'ownerReviews'/);
  assert.match(page, /SET_OWNER_TAB', v: 'renters'/);
});

test('chat bubbles identify speaker from sender role, not only sender id', () => {
  const chatModal = read('components/ChatModal.jsx');
  const ownerDashboard = read('components/OwnerDashboard.jsx');

  assert.match(chatModal, /const viewerRole = currentUser\?\.role === 'owner' \? 'owner' : 'user'/);
  assert.match(chatModal, /function chatParticipantMeta/);
  assert.match(chatModal, /msg\.sender_role === viewerRole/);
  assert.match(chatModal, /label:\s*mine \? 'あなた' : 'オーナー'/);
  assert.match(chatModal, /rounded-full/);
  assert.doesNotMatch(chatModal, /mine \? 'Guest'/);

  assert.match(ownerDashboard, /function ownerChatParticipantMeta/);
  assert.match(ownerDashboard, /msg\.sender_role === 'owner'/);
  assert.match(ownerDashboard, /label:\s*mine \? 'あなた' : 'ゲスト'/);
  assert.doesNotMatch(ownerDashboard, /mine \? 'Owner'/);
});
