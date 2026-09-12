import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test('public password reset uses a custom email with a Supabase recovery link', () => {
  assert.equal(exists('app/api/auth/password-reset/route.js'), true);

  const route = read('app/api/auth/password-reset/route.js');
  const reset = read('lib/passwordReset.js');
  const email = read('lib/email.js');
  const authModal = read('components/AuthModal.jsx');

  assert.match(route, /export async function POST\(req\)/);
  assert.match(route, /sendPasswordResetLink/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true \}\)/);

  assert.match(reset, /PASSWORD_RESET_THROTTLE_PURPOSE = 'password_reset'/);
  assert.match(reset, /createOtp\(PASSWORD_RESET_THROTTLE_PURPOSE, normalizedEmail\)/);
  assert.match(reset, /supabaseAdmin\.auth\.admin\.generateLink\(\{[\s\S]*type: 'recovery'[\s\S]*email: normalizedEmail[\s\S]*redirectTo/);
  assert.match(reset, /properties\?\.action_link/);
  assert.match(reset, /sendPasswordResetEmail\(\{[\s\S]*to: normalizedEmail[\s\S]*resetUrl: actionLink/);
  assert.match(reset, /user_not_found/);

  assert.match(email, /export async function sendPasswordResetEmail/);
  assert.match(email, /パスワード再設定/);
  assert.match(email, /resetUrl/);
  assert.match(email, /text/);

  assert.match(authModal, /fetch\('\/api\/auth\/password-reset'/);
  assert.doesNotMatch(authModal, /supabase\.auth\.resetPasswordForEmail/);
});

test('master reset action uses the same custom reset email path', () => {
  const route = read('app/api/admin/users/route.js');

  assert.match(route, /import \{ sendPasswordResetLink \}/);
  assert.match(route, /action === 'reset_password'/);
  assert.match(route, /await sendPasswordResetLink\(\{[\s\S]*email[\s\S]*requestOrigin: new URL\(req\.url\)\.origin/);
  assert.doesNotMatch(route, /resetPasswordForEmail\(email/);
});
