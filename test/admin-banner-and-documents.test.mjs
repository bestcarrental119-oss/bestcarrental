import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('home hero banners are hydrated from editable app state', () => {
  const data = read('lib/data.js');
  const context = read('lib/context.jsx');
  const frontend = read('components/FrontendApp.jsx');

  assert.match(data, /INIT_HERO_BANNERS/);
  assert.match(context, /heroBanners:\s*\[\.\.\.INIT_HERO_BANNERS\]/);
  assert.match(context, /case 'UPDATE_HERO_BANNERS'/);
  assert.match(context, /fetch\('\/api\/banners'/);
  assert.match(frontend, /heroBanners/);
  assert.doesNotMatch(frontend, /const HERO_BANNERS = \[/);
});

test('admin can upload, remove, and reorder hero banners', () => {
  assert.ok(existsSync(new URL('../app/api/banners/route.js', import.meta.url)));

  const admin = read('components/AdminApp.jsx');
  const route = read('app/api/banners/route.js');

  assert.match(admin, /id: 'banners'/);
  assert.match(admin, /function BannerManager/);
  assert.match(admin, /accept="\.jpg,\.jpeg,\.png,\.webp"/);
  assert.match(admin, /moveBanner/);
  assert.match(admin, /removeBanner/);
  assert.match(admin, /UPDATE_HERO_BANNERS/);

  assert.match(route, /MAX_BANNER_COUNT/);
  assert.match(route, /MAX_IMAGE_BYTES/);
  assert.match(route, /DATA_IMAGE_RE/);
  assert.match(route, /\(jpeg\|png\|webp\)/);
  assert.match(route, /saveHeroBanners/);
});

test('vehicle approval shows downloadable safety documents for inspection review', () => {
  const admin = read('components/AdminApp.jsx');

  assert.match(admin, /DocumentActionLinks/);
  assert.match(admin, /download=\{fileName\}/);
  assert.match(admin, /aria-label=\{`\$\{label\}を表示`\}/);
  assert.match(admin, /aria-label=\{`\$\{label\}をDL`\}/);
  assert.match(admin, /label="車検証"/);
  assert.match(admin, /label="任意保険"/);
});

test('light admin and owner modes keep backend text readable and include OKA airport art', () => {
  const admin = read('components/AdminApp.jsx');
  const ownerAppearance = read('components/OwnerAppearance.jsx');

  assert.ok(existsSync(new URL('../public/airports/OKA.jpg', import.meta.url)));
  assert.match(admin, /function AdminReadableLightStyles/);
  assert.match(admin, /admin-readable-light/);
  assert.match(admin, /adminLightMode/);
  assert.match(ownerAppearance, /text-gray-600/);
  assert.match(ownerAppearance, /text-gray-700/);
  assert.match(ownerAppearance, /placeholder/);
});
