import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('approved owner dashboard lookup sends login email as a fallback identifier', () => {
  const dashboard = read('components/OwnerDashboard.jsx');
  const route = read('app/api/owners/me/route.js');

  assert.match(dashboard, /new URLSearchParams\(\{ userId: currentUser\.id \}\)/);
  assert.match(dashboard, /ownerLookupParams\.set\('email', currentUser\.email\)/);
  assert.match(dashboard, /\/api\/owners\/me\?\$\{ownerLookupParams\.toString\(\)\}&_=\$\{Date\.now\(\)\}/);

  assert.match(route, /normalizeEmail/);
  assert.match(route, /searchParams\.get\('email'\)/);
  assert.match(route, /findOwnerByEmail/);
  assert.match(route, /const normalizedEmail = normalizeEmail\(email\)/);
  assert.match(route, /const emailList = \[\.\.\.new Set/);
  assert.match(route, /findOwnerForLogin\(userId, \[authEmail, fallbackEmail\]\)/);
  assert.match(route, /\.ilike\('email', normalizedEmail\)/);
  assert.match(route, /\.ilike\('email', `%\$\{normalizedEmail\}%`\)/);
  assert.match(route, /function choosePrimaryOwner/);
  assert.match(route, /owner\.status === 'approved'/);
  assert.match(route, /owner\.business_type !== 'additional_store'/);
  assert.match(route, /findOwnerForLogin/);
});

test('owner dashboard uses dedicated Best Go and Best One Way management pages from local nav', () => {
  const dashboard = read('components/OwnerDashboard.jsx');
  const frontend = read('components/FrontendApp.jsx');
  const crossReturnPanel = read('components/CrossReturnPanel.jsx');
  const i18n = read('lib/i18n.js');
  const managementStart = dashboard.indexOf('function BestGoOneWayManagement');
  const managementEnd = dashboard.indexOf('// ── OneWayReturnSettings', managementStart);
  const managementSource = dashboard.slice(managementStart, managementEnd);

  assert.match(dashboard, /function BestGoOneWayManagement/);
  assert.match(dashboard, /id: 'best-go-oneway'/);
  assert.match(dashboard, /const PRIMARY_TABS = \['today', 'calendar', 'vehicles', 'chat', 'menu'\]/);
  assert.match(dashboard, /OwnerDashboardTabIcon/);
  assert.match(dashboard, /best-go-icon\.png/);
  assert.match(dashboard, /oneway-icon\.png/);
  assert.match(dashboard, /ownerTabBestGoOneWay/);
  assert.match(dashboard, /<BestGoOneWayManagement/);
  assert.match(dashboard, /<OneWayPublishLauncher/);
  assert.match(dashboard, /<OneWayReturnSettings/);
  assert.match(dashboard, /<CrossReturnPanel/);
  assert.match(dashboard, /activeBestGoOneWaySection/);
  assert.match(dashboard, /activeSection=\{activeBestGoOneWaySection\}/);
  assert.match(dashboard, /window\.__bestGoOneWayNavigate = navigateManagerSection/);
  assert.doesNotMatch(managementSource, /scrollIntoView\(\{ behavior: 'smooth'/);
  assert.match(frontend, /function IconBestGoMark/);
  assert.match(frontend, /const bestGoOneWayShortcuts = \[/);
  assert.match(frontend, /data-best-go-oneway-local-nav/);
  assert.match(frontend, /window\.__bestGoOneWayNavigate/);
  assert.match(frontend, /id: 'vehicles', label: t\('ownerTabVehicles'\)/);
  assert.match(frontend, /best-go-icon\.png/);
  assert.match(frontend, /oneway-icon\.png/);
  assert.match(crossReturnPanel, /data-best-go-section="accept"/);
  assert.match(crossReturnPanel, /data-best-go-section="vehicles"/);
  assert.match(crossReturnPanel, /data-best-go-section="send"/);
  assert.match(crossReturnPanel, /data-best-go-section="ops"/);
  assert.match(crossReturnPanel, /activeSection = 'accept'/);
  assert.match(crossReturnPanel, /activeSection === 'vehicles'/);
  assert.match(crossReturnPanel, /activeSection === 'send'/);
  assert.match(crossReturnPanel, /activeSection === 'ops'/);
  assert.doesNotMatch(dashboard, /id: 'oneway'/);
  assert.doesNotMatch(dashboard, /id: 'cross-return'/);
  assert.match(i18n, /ownerTabBestGoOneWay: 'Best Go \/ Best One Way Management'/);
  assert.match(i18n, /ownerTabBestGoOneWay: 'Best Go \/ Best One Way 管理'/);
  assert.match(i18n, /bestGoNavAccept: 'Accept'/);
  assert.match(i18n, /bestGoNavAccept: '受入'/);
});
