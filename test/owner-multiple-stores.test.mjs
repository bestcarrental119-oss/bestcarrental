import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner login lookup can return and assign multiple stores for one account', () => {
  const route = read('app/api/owners/me/route.js');
  const dashboard = read('components/OwnerDashboard.jsx');

  assert.match(route, /function choosePrimaryOwner/);
  assert.match(route, /async function assignOwnersToUser/);
  assert.match(route, /async function findOwnersByParentIds/);
  assert.match(route, /\.in\('parent_owner_id', ids\)/);
  assert.match(route, /async function findOwnersByIds/);
  assert.match(route, /async function expandOwnerFamily/);
  assert.match(route, /const parentOwners = await findOwnersByIds/);
  assert.match(route, /async function findOwnersByRelatedKeys/);
  assert.match(route, /ownerUserIds\.has\(String\(owner\.user_id\)\)/);
  assert.match(route, /parentOwnerIds\.has\(String\(owner\.parent_owner_id\)\)/);
  assert.match(route, /const relatedOwners = await findOwnersByRelatedKeys/);
  assert.match(route, /owner\.parent_owner_id/);
  assert.match(route, /const NO_CACHE_HEADERS/);
  assert.match(route, /function ownerVisibleInOwnerBackend/);
  assert.match(route, /String\(owner\?\.status \?\? ''\)\.toLowerCase\(\) !== 'rejected'/);
  assert.match(route, /const ownerFamily = visibleOwnerRows\(await expandOwnerFamily\(initialOwners\)\)/);
  assert.match(route, /const assignedOwners = await assignOwnersToUser\(ownerFamily, userId\)/);
  assert.match(route, /NextResponse\.json\(\{ owner: primaryOwner, owners: assignedOwners \}, \{ headers: NO_CACHE_HEADERS \}\)/);
  assert.match(route, /NextResponse\.json\(primaryOwner, \{ headers: NO_CACHE_HEADERS \}\)/);
  assert.match(route, /NextResponse\.json\(\{ owner: null, owners: \[\] \}, \{ headers: NO_CACHE_HEADERS \}\)/);
  assert.match(route, /const normalizedEmail = normalizeEmail\(email\)/);
  assert.match(route, /\.ilike\('email', `%\$\{normalizedEmail\}%`\)/);
  assert.match(route, /filter\(owner => normalizeEmail\(owner\.email\) === normalizedEmail\)/);
  assert.match(route, /const includeAll = searchParams\.get\('includeAll'\) === '1'/);
  assert.doesNotMatch(route, /return assignOwnerToUser\(chooseOwner/);

  assert.match(dashboard, /const \[owners, setOwners\]/);
  assert.match(dashboard, /ownerLookupParams\.set\('includeAll', '1'\)/);
  assert.match(dashboard, /const loadOwners = useCallback/);
  assert.match(dashboard, /setOwners\(ownerList\)/);
  assert.match(dashboard, /const approvedOwners = owners\.filter\(candidate => candidate\?\.status === 'approved'\)/);
  assert.match(dashboard, /const pendingStoreApplications = owners\.filter/);
  assert.match(dashboard, /selectedOwnerId/);
  assert.match(dashboard, /approvedOwners\.map\(candidate =>/);
  assert.match(dashboard, /od_currentStore/);
  assert.match(dashboard, /od_switchStore/);
  assert.match(dashboard, /od_refreshStores/);
  assert.match(dashboard, /od_storeSwitchHint/);
  assert.match(dashboard, /od_pendingStoreApplications/);
  assert.match(dashboard, /aria-label=\{t\('od_switchStore'\)\}/);
});

test('approved owners can open another store application from the dashboard menu', () => {
  const context = read('lib/context.jsx');
  const dashboard = read('components/OwnerDashboard.jsx');
  const frontend = read('components/FrontendApp.jsx');

  assert.match(context, /ownerOnboardingMode:\s+'owner'/);
  assert.match(context, /ownerOnboardingParentOwnerId:\s+null/);
  assert.match(context, /ownerOnboardingMode:\s*action\.ownerOnboardingMode \|\| 'owner'/);
  assert.match(context, /ownerOnboardingParentOwnerId:\s*action\.ownerOnboardingParentOwnerId \?\? null/);
  assert.match(dashboard, /od_addStoreBtn/);
  assert.match(dashboard, /od_addStoreDesc/);
  assert.match(dashboard, /dispatch\(\{ type: 'SET_PAGE', v: 'owner-register', ownerOnboardingMode: 'store', ownerOnboardingParentOwnerId: owner\.id \}\)/);
  assert.match(dashboard, /window\.scrollTo\(0, 0\)/);

  assert.match(frontend, /<OwnerOnboarding/);
  assert.match(frontend, /mode=\{ownerOnboardingMode\}/);
  assert.match(frontend, /onClose=\{\(\) => dispatch\(\{ type: 'SET_PAGE', v: 'owner-dashboard' \}\)\}/);
});

test('additional store application uses a lightweight store-only form', () => {
  const onboarding = read('components/OwnerOnboarding.jsx');
  const ownersApi = read('app/api/owners/route.js');
  const admin = read('components/AdminApp.jsx');
  const i18n = read('lib/i18nOwnerAdmin.js');

  assert.match(onboarding, /export default function OwnerOnboarding\(\{ onClose, mode = 'owner' \}\)/);
  assert.match(onboarding, /const isStoreAddition = mode === 'store'/);
  assert.match(onboarding, /ownerOnboardingParentOwnerId/);
  assert.match(onboarding, /fd\.append\('parentOwnerId', ownerOnboardingParentOwnerId\)/);
  assert.match(onboarding, /if \(isStoreAddition\) \{[\s\S]*!storeLocation \|\| !phone \|\| !email/);
  assert.match(onboarding, /if \(!isStoreAddition && \(!emailVerified \|\| email !== verifiedEmail\)\)/);
  assert.match(onboarding, /fd\.append\('applicantName', isStoreAddition/);
  assert.match(onboarding, /fd\.append\('businessType',\s+isStoreAddition \? 'additional_store' : bizType\)/);
  assert.match(onboarding, /isStoreAddition \? t\('oo_storeAddTitle'\) : t\('oo_title'\)/);
  assert.match(onboarding, /isStoreAddition \? t\('oo_storeEmail'\) : t\('oo_email'\)/);
  assert.match(onboarding, /!isStoreAddition && \(\s*<>/);
  assert.match(onboarding, /oo_storeAddReviewNote/);

  assert.match(admin, /owner\?\.business_type === 'additional_store'/);
  assert.match(admin, /ad_storeAdditionApplication/);
  assert.match(admin, /ad_newOwnerApplication/);
  assert.match(admin, /ad_additionalStore/);
  assert.match(i18n, /ad_storeAdditionApplication: '店舗追加申請'/);
  assert.match(i18n, /ad_newOwnerApplication: '新規オーナー申請'/);
  assert.match(ownersApi, /async function resolveOwnerUserId/);
  assert.match(ownersApi, /if \(businessType !== 'additional_store'\) return cleanUserId/);
  assert.match(ownersApi, /return data\?\.user_id \?\? cleanUserId/);
  assert.match(ownersApi, /parent_owner_id:\s+businessType === 'additional_store' \? cleanUuid\(rawParentOwnerId\) : null/);
  assert.match(ownersApi, /businessType !== 'additional_store'/);
  assert.match(ownersApi, /parentOwnerId/);
});

test('owner applications keep applicant name separate from public store display name', () => {
  const ownersApi = read('app/api/owners/route.js');
  const onboarding = read('components/OwnerOnboarding.jsx');
  const admin = read('components/AdminApp.jsx');
  const schema = read('supabase/owners_schema.sql');
  const migration = read('supabase/migrations/20260822_owner_multi_store_display_name.sql');

  assert.match(schema, /ADD COLUMN IF NOT EXISTS applicant_name TEXT/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS parent_owner_id UUID REFERENCES owners\(id\) ON DELETE SET NULL/);
  assert.match(schema, /business_type IN \('individual', 'corporation', 'additional_store'\)/);
  assert.match(migration, /applicant_name/);
  assert.match(migration, /parent_owner_id uuid references public\.owners\(id\) on delete set null/);
  assert.match(migration, /owners_business_type_check/);
  assert.match(migration, /additional_store/);
  assert.match(migration, /store_name is null/);

  assert.match(ownersApi, /function defaultPublicStoreName/);
  assert.match(ownersApi, /applicant_name:\s*form\.get\('applicantName'\)/);
  assert.match(ownersApi, /store_name:\s*form\.get\('displayStoreName'\) \|\| defaultPublicStoreName/);
  assert.match(ownersApi, /storeName/);
  assert.match(ownersApi, /updates\.store_name/);

  assert.match(onboarding, /applicantName/);
  assert.doesNotMatch(onboarding, /fd\.append\('storeName',\s*storeName\)/);
  assert.match(onboarding, /fd\.append\('applicantName', isStoreAddition[\s\S]*: applicantName\)/);

  assert.match(admin, /publicStoreName/);
  assert.match(admin, /savePublicStoreName/);
  assert.match(admin, /ad_applicantName/);
  assert.match(admin, /ad_publicStoreName/);
  assert.match(admin, /storeName:\s*publicStoreName/);
});

test('master can remove an additional store without exposing it to normal admins', () => {
  const ownersApi = read('app/api/owners/route.js');
  const ownersMeApi = read('app/api/owners/me/route.js');
  const admin = read('components/AdminApp.jsx');
  const visibility = read('lib/ownerVisibility.js');

  assert.match(ownersApi, /import \{ isMasterUser \}/);
  assert.match(ownersApi, /import \{ isMasterDeletedOwner \}/);
  assert.match(ownersApi, /export const dynamic = 'force-dynamic'/);
  assert.match(ownersApi, /const NO_CACHE_HEADERS/);
  assert.match(ownersApi, /NextResponse\.json\(\(data \?\? \[\]\)\.filter\(owner => !isMasterDeletedOwner\(owner\)\), \{ headers: NO_CACHE_HEADERS \}\)/);
  assert.match(ownersApi, /async function assertMaster/);
  assert.match(ownersApi, /function bearerToken/);
  assert.match(ownersApi, /export async function DELETE\(req\)/);
  assert.match(ownersApi, /const guard = await assertMaster\(req, requesterId\)/);
  assert.match(ownersApi, /supabaseAdmin\.auth\.getUser\(token\)/);
  assert.match(ownersApi, /token required/);
  assert.match(ownersApi, /isMasterUser\(data\.user\)/);
  assert.match(ownersApi, /business_type !== 'additional_store'/);
  assert.doesNotMatch(ownersApi, /\|\| !owner\.parent_owner_id/);
  assert.match(ownersApi, /追加店舗だけ削除できます/);
  assert.match(ownersApi, /status: 'rejected'/);
  assert.match(ownersApi, /Deleted by master/);
  assert.match(ownersApi, /filter\(owner => !isMasterDeletedOwner\(owner\)\)/);
  assert.match(ownersApi, /from\('vehicles'\)[\s\S]*update\(\{ status: 'inactive', approval_status: 'rejected' \}/);
  assert.match(ownersApi, /owner_pickup_records\.deleted/);

  assert.match(ownersMeApi, /import \{ isMasterDeletedOwner, withoutMasterDeletedOwners \}/);
  assert.match(ownersMeApi, /function ownerVisibleInOwnerBackend/);
  assert.match(ownersMeApi, /visibleOwnerRows\(await expandOwnerFamily\(initialOwners\)\)/);
  assert.match(visibility, /export const MASTER_DELETED_OWNER_IDS = new Set/);
  assert.match(visibility, /8957203c-70ca-4218-89cb-625e21a43bd9/);
  assert.match(visibility, /MASTER_DELETED_OWNER_IDS\.has\(String\(owner\.id \?\? ''\)\)/);
  assert.match(visibility, /export function isMasterDeletedOwner/);
  assert.match(visibility, /Deleted by master/);

  assert.match(admin, /const \[deletingStoreId, setDeletingStoreId\]/);
  assert.match(admin, /function deleteAdditionalStore/);
  assert.match(admin, /async function masterSessionHeaders/);
  assert.match(admin, /onDeleteStore=\{deleteAdditionalStore\}/);
  assert.match(admin, /canDelete=\{currentUser\?\.isMaster\}/);
  assert.match(admin, /method: 'DELETE'/);
  assert.match(admin, /headers: await masterSessionHeaders\(\{ 'Content-Type': 'application\/json' \}\)/);
  assert.match(admin, /requesterId: currentUser\?\.id/);
  assert.match(admin, /setOwners\(prev => prev\.filter\(candidate => String\(candidate\?\.id\) !== String\(store\.id\)\)\)/);
  assert.match(admin, /function ownersListUrl/);
  assert.match(admin, /fetchOwnersList/);
  assert.match(admin, /cache:\s*'no-store'/);
  assert.match(admin, /currentUser\?\.isMaster && isStoreAddition\(o\)/);
  assert.match(admin, /追加店舗を削除/);
});

test('master owner store map only shows active owner stores', () => {
  const admin = read('components/AdminApp.jsx');

  assert.match(admin, /const activeOwners = withoutMasterDeletedOwners\(owners\)\.filter/);
  assert.match(admin, /owner\?\.status !== 'rejected'/);
  assert.match(admin, /const ownerById = Object\.fromEntries\(activeOwners/);
  assert.match(admin, /activeOwners\.forEach\(owner =>/);
});

test('duplicate archived route-search source folder is not tracked', () => {
  assert.equal(existsSync(new URL('../best-go-one-way-route-search-files-v5', import.meta.url)), false);
});

test('approving an additional store links it to the parent owner account automatically', () => {
  const ownersApi = read('app/api/owners/route.js');
  const migration = read('supabase/migrations/20260823_auto_link_additional_stores.sql');

  assert.match(ownersApi, /async function linkApprovedAdditionalStoreToOwnerAccount/);
  assert.match(ownersApi, /updates\.status !== 'approved'/);
  assert.match(ownersApi, /business_type, parent_owner_id, user_id/);
  assert.match(ownersApi, /owner\?\.business_type !== 'additional_store'/);
  assert.match(ownersApi, /owner\.parent_owner_id/);
  assert.match(ownersApi, /\.select\('user_id'\)/);
  assert.match(ownersApi, /linked\.user_id = parent\?\.user_id/);
  assert.match(ownersApi, /async function findPrimaryOwnerForUser/);
  assert.match(ownersApi, /\.eq\('user_id', owner\.user_id\)/);
  assert.match(ownersApi, /\.neq\('business_type', 'additional_store'\)/);
  assert.match(ownersApi, /linked\.parent_owner_id = parent\?\.id/);
  assert.match(ownersApi, /const linkedUpdates = await linkApprovedAdditionalStoreToOwnerAccount\(id, updates\)/);
  assert.match(ownersApi, /\.update\(linkedUpdates\)/);

  assert.match(migration, /create or replace function public\.link_additional_store_owner_user/);
  assert.match(migration, /new\.business_type = 'additional_store'/);
  assert.match(migration, /new\.parent_owner_id is null and new\.user_id is not null/);
  assert.match(migration, /new\.parent_owner_id := parent_owner_id_value/);
  assert.match(migration, /new\.user_id := parent_user_id/);
  assert.match(migration, /create trigger owners_link_additional_store_owner_user/);
  assert.match(migration, /before insert or update of status, business_type, parent_owner_id, user_id/);
  assert.match(migration, /update public\.owners child/);
  assert.match(migration, /child\.business_type = 'additional_store'/);
  assert.match(migration, /child\.parent_owner_id = parent\.id/);
  assert.match(migration, /child\.parent_owner_id is null/);
  assert.match(migration, /parent\.business_type <> 'additional_store'/);
});
