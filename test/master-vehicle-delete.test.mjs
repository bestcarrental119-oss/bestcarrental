import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('master vehicle delete can bypass active reservations only after server-side master auth', () => {
  const route = read('app/api/vehicles/[id]/route.js');
  const forceRoute = read('app/api/admin/vehicles/[id]/force-delete/route.js');
  const admin = read('components/AdminApp.jsx');

  assert.match(route, /import \{ isMasterEmail, isMasterUser \}/);
  assert.match(route, /function errorMessage\(value\)/);
  assert.match(route, /function bearerToken\(req\)/);
  assert.match(route, /async function readDeleteBody\(req\)/);
  assert.match(route, /async function isMasterDeleteRequest\(\{ token, requesterId, requesterEmail \}/);
  assert.match(route, /async function masterForceDeleteVehicle\(vehicleId, vehicle\)/);
  assert.match(route, /if \(!supabaseAdmin\) return NextResponse\.json\(\{ error: 'Supabase service role not configured' \}, \{ status: 503 \}\)/);
  assert.doesNotMatch(route, /async function forceHideVehicleForMasterDelete/);
  assert.doesNotMatch(route, /return NextResponse\.json\(\{ success: true \}\)/);
  assert.match(route, /supabaseAdmin\.auth\.getUser\(token\)/);
  assert.match(route, /const tokenEmailIsMaster = isMasterEmail\(data\.user\.email\)/);
  assert.match(route, /const requesterEmailIsMaster = isMasterEmail\(requesterEmail\)/);
  assert.match(route, /if \(!isMasterUser\(data\.user\) && !\(tokenEmailIsMaster && requesterEmailIsMaster\)\) return false/);
  assert.match(route, /if \(requesterId && data\.user\.id !== requesterId && !\(tokenEmailIsMaster && requesterEmailIsMaster\)\) return false/);
  assert.match(route, /const body = await readDeleteBody\(req\)/);
  assert.match(route, /const masterToken = body\?\.accessToken \|\| bearerToken\(req\)/);
  assert.match(route, /token: masterToken/);
  assert.match(route, /requesterId: body\?\.requesterId \?\? searchParams\.get\('requesterId'\)/);
  assert.match(route, /requesterEmail: body\?\.requesterEmail \?\? searchParams\.get\('requesterEmail'\)/);
  assert.match(route, /\.select\('id, owner_id, owner_auth_id, cls'\)/);
  assert.match(route, /\.rpc\('master_force_delete_vehicle', \{ target_vehicle_id: vehicleId \}\)/);
  assert.match(route, /throw new Error\('Supabase SQL master_force_delete_vehicle is not installed\. Run supabase\/master_force_delete_vehicle\.sql first\.'\)/);
  assert.doesNotMatch(route, /await detachVehicleReferencesForMasterDelete/);
  assert.doesNotMatch(route, /status: 'deleted'/);
  assert.doesNotMatch(route, /approval_status: 'rejected'[\s\S]*one_way_enabled: false/);
  assert.match(route, /attemptedMasterDelete/);
  assert.match(route, /code: 'master_auth_failed'/);
  assert.match(route, /if \(!isMasterDelete\) \{[\s\S]*active_reservations[\s\S]*\}/);
  assert.match(route, /if \(isMasterDelete\) \{[\s\S]*const result = await masterForceDeleteVehicle\(params\.id, vehicle\)[\s\S]*mode: result\?\.mode/);
  assert.match(route, /NextResponse\.json\(\{ error: errorMessage\(e\) \}/);
  const masterGate = route.indexOf('if (!isMasterDelete) {');
  const activeReservationCheck = route.indexOf("if ((activeReservations ?? []).length > 0)", masterGate);
  const deleteAfterGate = route.indexOf("\n    }\n\n    const { error } = await supabaseAdmin.from('vehicles').delete", activeReservationCheck);
  assert.ok(masterGate > 0);
  assert.ok(activeReservationCheck > masterGate);
  assert.ok(deleteAfterGate > activeReservationCheck);

  assert.match(admin, /function readableError\(value\)/);
  assert.match(admin, /function vehicleDeleteErrorText\(data, res, t\)/);
  assert.match(admin, /const \{ vehicles, theme, currentUser \} = state/);
  assert.match(admin, /const accessToken = await masterAccessToken\(\)/);
  assert.match(admin, /credentials: 'same-origin'/);
  assert.doesNotMatch(admin, /\/api\/vehicles\/\$\{id\}[\s\S]*Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(admin, /`\/api\/admin\/vehicles\/\$\{id\}\/force-delete`/);
  assert.match(admin, /method: 'POST'/);
  assert.match(admin, /body: JSON\.stringify\(\{ requesterId: currentUser\.id, requesterEmail: currentUser\.email, accessToken \}\)/);
  assert.doesNotMatch(admin, /headers: currentUser\?\.isMaster \? await masterSessionHeaders\(\) : undefined/);
  assert.match(admin, /if \(!res\.ok\) throw new Error\(vehicleDeleteErrorText\(data, res, t\)\)/);
  assert.match(admin, /const displayVehicles = currentUser\?\.isMaster && adminVehicles\.length > 0 \? adminVehicles : vehicles/);
  assert.match(admin, /const visibleVehicles = currentUser\?\.isMaster \? displayVehicles : displayVehicles\.filter\(v => String\(v\.status \?\? ''\)\.toLowerCase\(\) !== 'deleted'\)/);
  assert.match(admin, /\{visibleVehicles\.map\(v => \(/);
  assert.match(admin, /dispatch\(\{ type: 'DELETE_VEHICLE', id, persist: false \}\)/);

  assert.match(forceRoute, /export async function POST\(req, \{ params \}\)/);
  assert.match(forceRoute, /supabaseAdmin\.auth\.getUser\(accessToken\)/);
  assert.match(forceRoute, /isMasterUser\(data\.user\)/);
  assert.match(forceRoute, /\.rpc\('master_force_delete_vehicle', \{ target_vehicle_id: params\.id \}\)/);
  assert.doesNotMatch(forceRoute, /\.from\('vehicles'\)\.delete\(\)/);
  assert.doesNotMatch(forceRoute, /active_reservations/);
});

test('master force delete SQL restores accidental hidden vehicles and only deletes the requested id', () => {
  const sql = read('supabase/master_force_delete_vehicle.sql');

  assert.match(sql, /create or replace function public\.master_force_delete_vehicle\(target_vehicle_id uuid\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/i);
  assert.match(sql, /update public\.vehicles[\s\S]*where status = 'deleted'/i);
  assert.match(sql, /delete from public\.vehicles where id = target_vehicle_id/i);
  assert.match(sql, /execute format\('delete from %I\.%I where %I = \$1'/i);
  assert.match(sql, /execute format\('update %I\.%I set %I = null where %I = \$1'/i);
  assert.match(sql, /revoke all on function public\.master_force_delete_vehicle\(uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.master_force_delete_vehicle\(uuid\) to service_role/i);
  assert.doesNotMatch(sql, /delete from public\.vehicles;/i);
  assert.doesNotMatch(sql, /update public\.vehicles\s+set\s+status = 'deleted'/i);
});
