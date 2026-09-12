import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { isSpecificVehicleAvailable, runOfFleetConfigOf, upgradeClassesFor } from '../../../../../../lib/runOfFleet';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', params.id)
    .single();

  if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 404 });
  if (ownerId && String(reservation.owner_id) !== String(ownerId)) {
    return NextResponse.json({ error: 'Reservation does not belong to this owner' }, { status: 403 });
  }

  const eligibleClasses = upgradeClassesFor(reservation.target_class ?? 'standard');
  const { data: vehicles, error: vehicleError } = await supabaseAdmin
    .from('vehicles')
    .select('id, maker, model, year, grade, cls, pax, fuel, trans, price_day, img_url, license_plate, status, approval_status, owner_id, holder')
    .eq('owner_id', reservation.owner_id);

  if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 500 });

  const { data: reservations, error: reservationsError } = await supabaseAdmin
    .from('reservations')
    .select('id, vehicle_id, pickup_at, return_at, status')
    .not('status', 'in', '("cancelled","canceled","rejected")')
    .lt('pickup_at', reservation.return_at)
    .gt('return_at', reservation.pickup_at);

  if (reservationsError) return NextResponse.json({ error: reservationsError.message }, { status: 500 });

  const availableVehicles = (vehicles ?? []).filter(v => {
    const approvalStatus = v.approval_status ?? 'approved';
    const status = v.status ?? 'active';
    const booth = runOfFleetConfigOf(v);
    return approvalStatus === 'approved'
      && status !== 'maintenance'
      && booth.enabled
      && eligibleClasses.includes(booth.targetClass)
      && isSpecificVehicleAvailable({
        vehicleId: v.id,
        reservations: reservations ?? [],
        pickup: reservation.pickup_at,
        ret: reservation.return_at,
        excludeReservationId: reservation.id,
      });
  });

  return NextResponse.json({
    reservationId: reservation.id,
    targetClass: reservation.target_class,
    availableVehicles,
  });
}
