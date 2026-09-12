import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { isSpecificVehicleAvailable, runOfFleetConfigOf, upgradeClassesFor } from '../../../../../../lib/runOfFleet';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { vehicleId, ownerId, assignedBy } = await req.json();
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 });

  const checked = await assignWithQueryBuilder({
    reservationId: params.id,
    vehicleId,
    ownerId,
    assignedBy,
  });
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: checked.status });
  return NextResponse.json(dbToReservation(checked.data));
}

async function assignWithQueryBuilder({ reservationId, vehicleId, ownerId, assignedBy }) {
  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (reservationError) return { error: reservationError.message, status: 404 };
  if (ownerId && String(reservation.owner_id) !== String(ownerId)) {
    return { error: 'Reservation does not belong to this owner', status: 403 };
  }
  if (reservation.assignment_status === 'assigned' && reservation.vehicle_id) {
    return { error: 'Reservation already has a vehicle assigned', status: 409 };
  }

  const { data: vehicle, error: vehicleError } = await supabaseAdmin
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();
  if (vehicleError) return { error: vehicleError.message, status: 404 };
  if (String(vehicle.owner_id) !== String(reservation.owner_id)) {
    return { error: 'Vehicle does not belong to reservation owner', status: 403 };
  }
  const approvalStatus = vehicle.approval_status ?? 'approved';
  const vehicleStatus = vehicle.status ?? 'active';
  if (approvalStatus !== 'approved' || vehicleStatus === 'maintenance') {
    return { error: 'Vehicle is not available for assignment', status: 409 };
  }
  const booth = runOfFleetConfigOf(vehicle);
  if (!booth.enabled || !upgradeClassesFor(reservation.target_class).includes(booth.targetClass)) {
    return { error: 'Vehicle class is not eligible for this reservation', status: 409 };
  }

  const { data: reservations, error: reservationsError } = await supabaseAdmin
    .from('reservations')
    .select('id, vehicle_id, pickup_at, return_at, status')
    .not('status', 'in', '("cancelled","canceled","rejected")')
    .lt('pickup_at', reservation.return_at)
    .gt('return_at', reservation.pickup_at);
  if (reservationsError) return { error: reservationsError.message, status: 500 };

  const available = isSpecificVehicleAvailable({
    vehicleId,
    reservations: reservations ?? [],
    pickup: reservation.pickup_at,
    ret: reservation.return_at,
    excludeReservationId: reservation.id,
  });
  if (!available) return { error: 'Vehicle is already booked for this period', status: 409 };

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .update({
      vehicle_id: vehicleId,
      assignment_status: 'assigned',
      status: reservation.status === 'pending_assignment' ? 'confirmed' : reservation.status,
      assigned_at: new Date().toISOString(),
      assigned_by: assignedBy ?? null,
    })
    .eq('id', reservationId)
    .select()
    .single();

  if (error) return { error: error.message, status: 500 };
  return { data };
}

function dbToReservation(r) {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    ownerId: r.owner_id,
    userId: r.user_id,
    pickup: r.pickup_at,
    ret: r.return_at,
    days: r.days,
    total: r.total,
    status: r.status,
    type: r.type,
    opts: r.opts ?? {},
    pickupLoc: r.pickup_loc,
    retLoc: r.return_loc,
    bookingType: r.booking_type,
    targetClass: r.target_class,
    assignmentStatus: r.assignment_status,
    assignedAt: r.assigned_at,
    assignedBy: r.assigned_by,
  };
}
