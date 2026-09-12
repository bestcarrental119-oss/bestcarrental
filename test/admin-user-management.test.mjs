import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('master-only user API protects listing, reset, create, password update, role update, and delete', () => {
  const route = read('app/api/admin/users/route.js');
  const master = read('lib/master.js');

  assert.match(route, /function safeUser/);
  assert.match(route, /function normalizeEmail/);
  assert.match(route, /function validRole/);
  assert.match(route, /function redactSensitiveMetadata/);
  assert.match(route, /import \{ sendPasswordResetLink \}/);
  assert.match(route, /passwordReadable: false/);
  assert.match(route, /passwordStatus: 'not_readable'/);

  assert.match(route, /export async function GET\(req\)/);
  assert.match(route, /searchParams\.get\('requesterId'\)/);
  assert.match(route, /const guard = await assertMaster\(requesterId\)/);
  assert.match(route, /isMasterUser\(data\.user\)/);
  assert.doesNotMatch(route, /export async function GET\(\)/);

  assert.match(route, /action === 'reset_password'/);
  assert.match(route, /action === 'create_user'/);
  assert.match(route, /action === 'set_password'/);
  assert.match(route, /admin\.createUser/);
  assert.match(route, /email_confirm:\s*true/);
  assert.match(route, /admin\.updateUserById\(userId,\s*\{ password/);
  assert.match(route, /await sendPasswordResetLink\(\{[\s\S]*email[\s\S]*requestOrigin: new URL\(req\.url\)\.origin/);

  assert.match(route, /export async function DELETE\(req\)/);
  assert.match(route, /const guard = await assertMaster\(requesterId\)/);
  assert.doesNotMatch(route, /const guard = await assertAdmin\(requesterId\)/);

  assert.match(master, /export const MASTER_USER_IDS/);
  assert.match(master, /export function isMasterUserId/);
  assert.match(master, /export function isMasterUser/);
  assert.match(master, /6d3591dd-d180-4e13-af53-4b8f4ebd0d89/);
});

test('admin UI exposes master account controls for adding users and setting temporary passwords', () => {
  const admin = read('components/AdminApp.jsx');
  const i18n = read('lib/i18nOwnerAdmin.js');

  assert.match(admin, /\/api\/admin\/users\?requesterId=\$\{encodeURIComponent\(currentUser\?\.id \?\? ''\)\}/);
  assert.match(admin, /const \[newUser, setNewUser\]/);
  assert.match(admin, /const \[passwordEdit, setPasswordEdit\]/);
  assert.match(admin, /action: 'create_user'/);
  assert.match(admin, /action: 'set_password'/);
  assert.match(admin, /requesterId: currentUser\?\.id/);
  assert.match(admin, /currentUser\?\.isMaster && String\(u\.id\) !== String\(currentUser\?\.id\)/);
  assert.match(admin, /type="text"[\s\S]*placeholder=\{t\('adx_tempPassword'\)\}/);

  assert.match(i18n, /adx_addUser/);
  assert.match(i18n, /adx_setPassword/);
  assert.match(i18n, /adx_tempPassword/);
  assert.match(i18n, /現在のパスワードは復元・表示できません/);
});

test('admin user lists wait for the restored master session and show API errors instead of fake empty state', () => {
  const admin = read('components/AdminApp.jsx');
  const i18n = read('lib/i18nOwnerAdmin.js');

  assert.match(admin, /const \[userLoadError, setUserLoadError\]/);
  assert.match(admin, /if \(!currentUser\?\.id\)/);
  assert.match(admin, /useEffect\(\(\) => \{ load\(\); \}, \[currentUser\?\.id\]\)/);
  assert.match(admin, /if \(!res\.ok\)/);
  assert.match(admin, /setUserLoadError\(adminUsersErrorText\(data, res\)\)/);
  assert.match(admin, /t\('adx_userLoadFailed'\)/);
  assert.match(admin, /t\('adx_masterUsersTitle'\)/);
  assert.match(admin, /t\('adx_apiError'\)/);

  assert.match(i18n, /adx_userLoadFailed/);
  assert.match(i18n, /adx_masterUsersTitle/);
  assert.match(i18n, /adx_apiError/);
});

test('master accounts use a dedicated command UI instead of the normal admin shell', () => {
  const admin = read('components/AdminApp.jsx');
  const auth = read('components/AuthModal.jsx');
  const context = read('lib/context.jsx');
  const page = read('app/page.jsx');
  const frontend = read('components/FrontendApp.jsx');
  const mypage = read('components/MyPage.jsx');
  const i18n = read('lib/i18nOwnerAdmin.js');

  assert.match(admin, /const ADMIN_TAB_DEFS = \[/);
  assert.match(admin, /const MASTER_TAB_DEFS = \[/);
  assert.match(admin, /currentUser\?\.isMaster \? MASTER_TAB_DEFS : ADMIN_TAB_DEFS/);
  assert.match(admin, /currentUser\?\.isMaster && adminTab === 'dashboard' \? 'master' : adminTab/);
  assert.match(context, /import \{ isMasterUser \}/);
  assert.match(context, /const master = isMasterUser\(user\)/);
  assert.match(context, /role:\s+master/);
  assert.match(context, /isMaster: master/);
  assert.match(context, /currentUser:\s*action\.user,[\s\S]*adminTab:\s*action\.user\?\.isMaster \? 'master' : state\.adminTab/);
  assert.match(auth, /import \{ isMasterUser \}/);
  assert.match(auth, /const master = isMasterUser\(u\)/);
  assert.match(auth, /role:\s+master \? 'admin'/);
  assert.match(auth, /isMaster: master/);
  assert.match(page, /dispatch\(\{ type: 'SET_ADMIN_TAB', v: 'master' \}\)/);
  assert.match(frontend, /dispatch\(\{ type: 'SET_ADMIN_TAB', v: 'master' \}\)/);
  assert.match(mypage, /dispatch\(\{ type: 'SET_ADMIN_TAB', v: 'master' \}\)/);
  assert.match(admin, /t\('mst_sidebarTitle'\)/);
  assert.match(admin, /t\('mst_rootAuthority'\)/);
  assert.match(admin, /t\('mst_authorityTitle'\)/);
  assert.match(admin, /t\('mst_accountRoot'\)/);
  assert.match(admin, /t\('mst_storeAuthority'\)/);
  assert.match(admin, /t\('mst_auditControl'\)/);

  assert.match(i18n, /mst_sidebarTitle/);
  assert.match(i18n, /mst_rootAuthority/);
  assert.match(i18n, /mst_authorityTitle/);
  assert.match(i18n, /mst_accountRoot/);
  assert.match(i18n, /mst_storeAuthority/);
  assert.match(i18n, /mst_auditControl/);
});

test('master console shows marketing analytics for reservations, money flow, stores, vehicles, and users', () => {
  const admin = read('components/AdminApp.jsx');

  assert.match(admin, /function buildMasterAnalytics/);
  assert.match(admin, /function MasterBarChart/);
  assert.match(admin, /function MasterRankList/);
  assert.match(admin, /function MasterReservationLedger/);
  assert.match(admin, /monthlyRevenue/);
  assert.match(admin, /vehicleClassDemand/);
  assert.match(admin, /topStoreDemand/);
  assert.match(admin, /topVehicleDemand/);
  assert.match(admin, /reservationLedger/);
  assert.match(admin, /広告・おすすめ用データ/);
  assert.match(admin, /誰がどの車を予約したか/);
  assert.match(admin, /ユーザー傾向/);
});

test('master console and all-vehicles tab load the full admin vehicle list instead of seed/public vehicles', () => {
  const admin = read('components/AdminApp.jsx');

  assert.match(admin, /async function fetchAdminVehicleList\(\)/);
  assert.match(admin, /fetch\('\/api\/admin\/vehicles\?status=all/);
  assert.match(admin, /const \[adminVehicles, setAdminVehicles\]\s+= useState\(\[\]\)/);
  assert.match(admin, /setAdminVehicles\(Array\.isArray\(vRes\) \? vRes : \[\]\)/);
  assert.match(admin, /const masterVehicles = adminVehicles\.length > 0 \? adminVehicles : vehicles/);
  assert.match(admin, /\[t\('mst_vehicles'\), masterVehicles\.length\]/);
  assert.match(admin, /MasterStat label=\{t\('mst_vehicles'\)\} value=\{masterVehicles\.length\}/);
  assert.match(admin, /const displayVehicles = currentUser\?\.isMaster && adminVehicles\.length > 0 \? adminVehicles : vehicles/);
  assert.match(admin, /useEffect\(\(\) => \{[\s\S]*fetchAdminVehicleList\(\)[\s\S]*setAdminVehicles[\s\S]*\}, \[currentUser\?\.isMaster\]\)/);
  assert.match(admin, /const visibleVehicles = currentUser\?\.isMaster \? displayVehicles : displayVehicles\.filter/);
});

test('master console shows which owner account owns which stores', () => {
  const admin = read('components/AdminApp.jsx');

  assert.match(admin, /function buildOwnerStoreGroups/);
  assert.match(admin, /function MasterOwnerStoreMatrix/);
  assert.match(admin, /ownerStoreGroups/);
  assert.match(admin, /オーナー別 店舗一覧/);
  assert.match(admin, /どのオーナーがどんな店舗を持っているか/);
  assert.match(admin, /親店舗/);
  assert.match(admin, /追加店舗/);
});

test('password recovery page supports Supabase code exchange links', () => {
  const resetPage = read('app/reset-password/page.jsx');
  const authModal = read('components/AuthModal.jsx');

  assert.match(resetPage, /exchangeCodeForSession/);
  assert.match(resetPage, /window\.location\.hash/);
  assert.match(resetPage, /otp_expired/);
  assert.match(resetPage, /new URLSearchParams\(window\.location\.search\)\.get\('code'\)/);
  assert.match(resetPage, /window\.history\.replaceState\(null, '', '\/reset-password'\)/);
  assert.match(authModal, /fetch\('\/api\/auth\/password-reset'/);
});

test('password reset redirects do not fall back to localhost for customer emails', async () => {
  const { authRedirectTo, resolveAuthRedirectOrigin } = await import('../lib/authRedirect.js');

  assert.equal(
    resolveAuthRedirectOrigin({ windowOrigin: 'http://localhost:3000', env: {} }),
    'https://www.bestcar-rental.com',
  );
  assert.equal(
    authRedirectTo('/reset-password', { requestOrigin: 'http://localhost:3000', env: {} }),
    'https://www.bestcar-rental.com/reset-password',
  );
  assert.equal(
    resolveAuthRedirectOrigin({ windowOrigin: 'https://www.bestcar-rental.com', env: {} }),
    'https://www.bestcar-rental.com',
  );
  assert.equal(
    resolveAuthRedirectOrigin({
      requestOrigin: 'http://localhost:3000',
      env: { NEXT_PUBLIC_SITE_URL: 'https://admin.example.com/' },
    }),
    'https://admin.example.com',
  );
});

test('password reset redirects ignore device-local origins and normalize configured URLs', async () => {
  const { authRedirectTo, resolveAuthRedirectOrigin } = await import('../lib/authRedirect.js');

  assert.equal(
    resolveAuthRedirectOrigin({ requestOrigin: 'http://192.168.1.42:3000', env: {} }),
    'https://www.bestcar-rental.com',
  );
  assert.equal(
    authRedirectTo('reset-password', { windowOrigin: 'http://10.0.0.5:3000', env: {} }),
    'https://www.bestcar-rental.com/reset-password',
  );
  assert.equal(
    authRedirectTo('/reset-password', { env: { NEXT_PUBLIC_APP_URL: 'https://bestcar-rental.com/account/' } }),
    'https://bestcar-rental.com/reset-password',
  );
  assert.equal(
    resolveAuthRedirectOrigin({ env: { VERCEL_URL: 'best-car-rental.vercel.app' } }),
    'https://best-car-rental.vercel.app',
  );
});
