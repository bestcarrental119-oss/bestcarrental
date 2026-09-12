import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('reservation availability checks require a true date overlap', () => {
  const checkRoute = read('app/api/reservations/check/route.js');
  const saveRoute = read('app/api/reservations/route.js');

  assert.doesNotMatch(checkRoute, /\.or\(`pickup_at\.lt\.\$\{ret\},return_at\.gt\.\$\{pickup\}`\)/);
  assert.match(checkRoute, /\.lt\('pickup_at', ret\)/);
  assert.match(checkRoute, /\.gt\('return_at', pickup\)/);

  assert.doesNotMatch(saveRoute, /\.or\(`pickup_at\.lt\.\$\{body\.ret\},return_at\.gt\.\$\{body\.pickup\}`\)/);
  assert.match(saveRoute, /\.lt\('pickup_at', body\.ret\)/);
  assert.match(saveRoute, /\.gt\('return_at', body\.pickup\)/);
});

test('vehicle document uploads persist a viewable data URL instead of a temporary blob URL', () => {
  const uploader = read('components/InspectionUploader.jsx');
  const admin = read('components/AdminApp.jsx');

  assert.match(uploader, /reader\.readAsDataURL\(file\)/);
  assert.match(uploader, /onChange\?\.\(\{ url: dataUrl/);
  assert.doesNotMatch(uploader, /URL\.createObjectURL\(file\)/);

  assert.match(admin, /function DocumentPreviewModal/);
  assert.match(admin, /openDocumentPreview/);
  assert.match(admin, /iframe/);
});

test('default hero banners use the newest three banner assets', () => {
  const data = read('lib/data.js');

  assert.match(data, /hero-banner-11\.jpeg/);
  assert.match(data, /hero-banner-22\.jpeg/);
  assert.match(data, /hero-banner-33\.jpeg/);
  assert.doesNotMatch(data, /hero-banner-4/);
});
