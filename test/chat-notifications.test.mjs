import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiRoute = readFileSync(new URL('../app/api/chat/[id]/route.js', import.meta.url), 'utf8');
const chatRoute = readFileSync(new URL('../app/api/chat/route.js', import.meta.url), 'utf8');
const unreadRoute = readFileSync(new URL('../app/api/chat/unread/route.js', import.meta.url), 'utf8');
const ownerDashboard = readFileSync(new URL('../components/OwnerDashboard.jsx', import.meta.url), 'utf8');
const frontendApp = readFileSync(new URL('../components/FrontendApp.jsx', import.meta.url), 'utf8');
const mapSearch = readFileSync(new URL('../components/MapSearch.jsx', import.meta.url), 'utf8');
const dataRoute = readFileSync(new URL('../app/api/data/route.js', import.meta.url), 'utf8');
const vehicleAvailRoute = readFileSync(new URL('../app/api/vehicles/avail/route.js', import.meta.url), 'utf8');
const ownersRoute = readFileSync(new URL('../app/api/owners/route.js', import.meta.url), 'utf8');
const ownersSchema = readFileSync(new URL('../supabase/owners_schema.sql', import.meta.url), 'utf8');
const chatModal = readFileSync(new URL('../components/ChatModal.jsx', import.meta.url), 'utf8');
const chatMessagesRoute = readFileSync(new URL('../app/api/chat/[id]/route.js', import.meta.url), 'utf8');
const translateRoute = readFileSync(new URL('../app/api/translate/route.js', import.meta.url), 'utf8');

test('owner inbox listens on the same per-user notification channel used by chat API', () => {
  assert.match(apiRoute, /channel\(`notify:\$\{notifyUserId\}`\)/);
  assert.match(ownerDashboard, /channel\(`notify:\$\{ownerUserId\}`\)/);
  assert.doesNotMatch(ownerDashboard, /notify-owner:/);
});

test('owner conversation queries include both auth user id and owner row ids', () => {
  assert.match(chatRoute, /resolveOwnerLookupIds/);
  assert.match(chatRoute, /\.in\('owner_user_id', ownerLookupIds\)/);
  assert.match(unreadRoute, /resolveOwnerLookupIds/);
  assert.match(unreadRoute, /\.in\('owner_user_id', ownerLookupIds\)/);
});

test('chat modal does not silently keep optimistic messages when API save fails', () => {
  assert.match(chatModal, /return conv\.id/);
  assert.match(chatModal, /const activeConversationId = conversationId \?\? await initConversation\(\)/);
  assert.match(chatModal, /if \(!activeConversationId\) \{/);
  assert.match(chatModal, /setInput\(text\);\n      setSending\(false\);\n      return;/);
  assert.match(chatModal, /if \(!res\.ok \|\| !conv\.id\)/);
  assert.match(chatModal, /if \(!res\.ok\) throw new Error/);
  assert.match(chatModal, /setMessages\(prev => prev\.filter\(msg => msg\.id !== optimistic\.id\)\)/);
});

test('chat route reuses one matching conversation without failing on duplicate legacy rows', () => {
  assert.match(chatRoute, /\.limit\(1\)/);
  assert.doesNotMatch(chatRoute, /\.in\('owner_user_id', ownerLookupIds\)\n    \.maybeSingle\(\)/);
});

test('chat translation uses actual message language and current deployment origin', () => {
  assert.match(chatModal, /detectLanguage\(text, targetLang\)/);
  assert.match(chatModal, /sourceLang: newMsg\.detected_lang/);
  assert.match(ownerDashboard, /detectLanguage\(text, targetLang\)/);
  assert.match(chatMessagesRoute, /new URL\(req\.url\)\.origin/);
  assert.match(translateRoute, /detectLanguage\(text\)/);
});

test('owners can opt in to pre-booking chat on public vehicle cards', () => {
  assert.match(ownersSchema, /pre_booking_chat_enabled\s+BOOLEAN\s+NOT NULL\s+DEFAULT false/);
  assert.match(ownersRoute, /preBookingChatEnabled/);
  assert.match(ownersRoute, /pre_booking_chat_enabled/);
  assert.match(ownersRoute, /updates\.pre_booking_chat_enabled = Boolean\(preBookingChatEnabled \?\? pre_booking_chat_enabled\)/);
  assert.match(dataRoute, /ownerChatById/);
  assert.match(dataRoute, /preBookingChatEnabled/);
  assert.match(dataRoute, /ownerAuthId/);
  assert.match(vehicleAvailRoute, /ownerChatById/);
  assert.match(vehicleAvailRoute, /preBookingChatEnabled/);
  assert.match(vehicleAvailRoute, /ownerAuthId/);
  assert.match(ownerDashboard, /preBookingChatEnabled/);
  assert.match(ownerDashboard, /savePreBookingChat/);
  assert.match(ownerDashboard, /予約前チャット/);
  assert.match(frontendApp, /canPreBookingChat/);
  assert.match(frontendApp, /v\.preBookingChatEnabled/);
  assert.match(frontendApp, /canPreBookingChat &&/);
  assert.match(mapSearch, /canPreBookingChat/);
  assert.match(mapSearch, /onChat/);
});

test('owner pre-booking chat toggle persists in owner dashboard state and reloads Supabase schema cache', () => {
  const preBookingSql = readFileSync(new URL('../supabase/pre_booking_chat.sql', import.meta.url), 'utf8');
  const runThisSql = readFileSync(new URL('../supabase/SUPABASE_今回実行するSQL.sql', import.meta.url), 'utf8');

  assert.match(ownerDashboard, /function OwnerSettings\(\{ ownerId, owner, theme, skin, onSkinChange, onOwnerUpdated \}\)/);
  assert.match(ownerDashboard, /const savedEnabled = Boolean\(json\?\.pre_booking_chat_enabled \?\? json\?\.preBookingChatEnabled \?\? enabled\)/);
  assert.match(ownerDashboard, /onOwnerUpdated\?\.\(\{ \.\.\.json, pre_booking_chat_enabled: savedEnabled, preBookingChatEnabled: savedEnabled \}\)/);
  assert.match(ownerDashboard, /onOwnerUpdated=\{\(nextOwner\) => setOwner\(prev => \(\{ \.\.\.prev, \.\.\.nextOwner \}\)\)\}/);
  assert.match(preBookingSql, /NOTIFY pgrst, 'reload schema'/);
  assert.match(runThisSql, /NOTIFY pgrst, 'reload schema'/);
});

test('chat API blocks pre-booking conversations unless the owner has opted in', () => {
  assert.match(chatRoute, /assertPreBookingChatAllowed/);
  assert.match(chatRoute, /pre_booking_chat_enabled/);
  assert.match(chatRoute, /\.from\('reservations'\)/);
  assert.match(chatRoute, /return NextResponse\.json\(\{ error: 'Pre-booking chat is not enabled for this owner' \}/);
});
