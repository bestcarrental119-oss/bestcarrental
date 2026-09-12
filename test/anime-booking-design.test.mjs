import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('booking modal uses the three booking guide characters without changing reservation logic', () => {
  const booking = read('components/BookingModal.jsx');

  assert.match(booking, /BOOKING_GUIDES/);
  assert.match(booking, /Masami/);
  assert.match(booking, /Rina/);
  assert.match(booking, /Risa/);
  assert.match(booking, /\/characters\/masami\.jpeg/);
  assert.match(booking, /\/characters\/rina\.png/);
  assert.match(booking, /\/characters\/risa\.png/);
  assert.match(booking, /buildReservationPayload/);
  assert.match(booking, /confirmCardPayment/);
});

test('booking character assets are available from public paths', () => {
  assert.ok(existsSync(new URL('../public/characters/masami.jpeg', import.meta.url)));
  assert.ok(existsSync(new URL('../public/characters/rina.png', import.meta.url)));
  assert.ok(existsSync(new URL('../public/characters/risa.png', import.meta.url)));
});

test('booking modal has a white and purple anime booking desk surface', () => {
  const booking = read('components/BookingModal.jsx');

  assert.match(booking, /bg-white/);
  assert.match(booking, /text-purple-900/);
  assert.match(booking, /border-purple-100/);
  assert.match(booking, /Anime Booking Desk/);
  assert.match(booking, /guide\.image/);
});
