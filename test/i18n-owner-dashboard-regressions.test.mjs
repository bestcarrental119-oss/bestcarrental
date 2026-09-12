import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('owner dashboard store switch labels never render raw i18n keys', () => {
  const i18n = read('lib/i18n.js');
  const i18nContext = read('lib/i18nContext.jsx');
  const dashboard = read('components/OwnerDashboard.jsx');

  assert.match(i18n, /function normalizeLocale/);
  assert.match(i18n, /if \(lower === 'zh'\) return 'zh-CN'/);
  assert.match(i18n, /const base = lower\.split\('-'\)\[0\]/);
  assert.match(i18n, /const normalizedLocale = normalizeLocale\(locale\)/);
  assert.match(i18nContext, /normalizeStoredLocale/);
  assert.match(i18nContext, /const normalized = normalizeStoredLocale\(next\)/);
  assert.match(i18nContext, /setLocaleState\(normalized\)/);

  assert.match(dashboard, /od_currentStore:\s*'表示中の店舗'/);
  assert.match(dashboard, /od_refreshStores:\s*'店舗一覧を更新'/);
  assert.match(dashboard, /od_refreshingStores:\s*'更新中\.\.\.'/);
  assert.match(dashboard, /od_addStoreBtn:\s*'＋ 店舗を追加'/);
  assert.match(dashboard, /od_storeSwitchHint:\s*'承認済み店舗が2つ以上あると、ここに店舗切替が表示されます。'/);
});
