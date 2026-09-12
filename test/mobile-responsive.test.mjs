import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('search page keeps desktop split view but stacks list and map on phones', () => {
  const mapSearch = read('components/MapSearch.jsx');

  assert.match(mapSearch, /md:flex-row/);
  assert.match(mapSearch, /h-\[56vh\]/);
  assert.match(mapSearch, /md:min-h-\[600px\]/);
  assert.match(mapSearch, /md:w-\[420px\]/);
  assert.match(mapSearch, /max-h-\[34vh\]/);
  assert.match(mapSearch, /p-2\.5[^"]*sm:p-4/);
  assert.match(mapSearch, /h-24[^"]*md:h-36/);
});

test('booking modal is usable on phone without changing the desktop wide modal', () => {
  const shared = read('components/Shared.jsx');
  const booking = read('components/BookingModal.jsx');

  assert.match(shared, /p-0[^"]*sm:p-4/);
  assert.match(shared, /max-h-\[100dvh\] sm:max-h-\[90vh\]/);
  assert.match(shared, /sm:rounded-2xl/);
  assert.match(booking, /p-4 sm:p-6/);
  assert.match(booking, /grid-cols-1[^"]*sm:grid-cols-2/);
});

test('admin and owner backends expose mobile navigation without replacing desktop layout', () => {
  const admin = read('components/AdminApp.jsx');
  const owner = read('components/OwnerDashboard.jsx');

  assert.match(admin, /hidden[^"]*md:flex/);
  assert.match(admin, /md:hidden/);
  assert.match(admin, /p-4 md:p-8/);
  assert.match(owner, /px-4[^"]*sm:px-6/);
  assert.match(owner, /min-w-max/);
  assert.match(owner, /grid-cols-1[^"]*sm:grid-cols-2/);
});

test('mobile home keeps the full banner visible and exposes primary navigation', () => {
  const frontend = read('components/FrontendApp.jsx');
  const i18n = read('lib/i18n.js');

  assert.match(frontend, /md:hidden[^"]*fixed[^"]*bottom-\[calc\(env\(safe-area-inset-bottom\)\+0\.75rem\)\]/);
  assert.match(frontend, /<section className="relative overflow-hidden min-h-screen flex flex-col pt-16/);
  assert.match(frontend, /h-\[260px\][^"]*object-contain[^"]*md:h-full[^"]*md:object-cover/);
  assert.match(frontend, /pt-\[272px\][^"]*md:absolute/);
  assert.doesNotMatch(frontend, /relative -mt-6/);
  assert.match(frontend, /corporate: t\('regularRental'\)/);
  assert.match(i18n, /regularRental:\s*'Regular Car Rental'/);
  assert.match(i18n, /regularRental:\s*'通常のレンタカー'/);
});
