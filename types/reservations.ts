/**
 * Best Car Rental — Shared TypeScript Type Definitions
 *
 * Anti-regression rule: All new properties are optional (?).
 * Existing consumers that don't set them won't break.
 */

// ─────────────────────────────────────────────────────────────
// 1. Enums / Literals
// ─────────────────────────────────────────────────────────────

/** How the reservation was created */
export type BookingType = 'specific' | 'class_based';

/** Vehicle-assignment lifecycle for class-based bookings */
export type AssignmentStatus = 'assigned' | 'pending_assignment';

/** Reservation lifecycle */
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'pending_assignment'   // class-based, vehicle not yet assigned
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'canceled'
  | 'rejected';

/** Normalised vehicle class identifiers */
export type VehicleClass = 'kei' | 'standard' | 'minivan' | 'large_van';

/** Service type */
export type ServiceType = 'corporate' | 'p2p' | 'parking';

// ─────────────────────────────────────────────────────────────
// 2. Vehicle
// ─────────────────────────────────────────────────────────────

export interface Vehicle {
  id: string | number;
  owner_id?: string | null;
  ownerId?: string | null;

  // Identity
  maker: string;
  model: string;
  year?: number | null;
  grade?: string | null;
  cls: VehicleClass;
  type: ServiceType;

  // Specs
  pax?: number;
  fuel?: string;
  trans?: string;

  // Pricing
  price_day?: number;
  priceDay?: number;
  priceHour?: number;
  deposit?: number;
  insurance?: number;

  // Display
  img?: string | null;
  img_url?: string | null;
  badge?: string | null;
  badgeBg?: string | null;
  tags?: string[];
  rating?: number;
  reviews?: number;
  loc?: string | null;
  lat?: number | null;
  lng?: number | null;
  airports?: string[];

  // Status
  status?: 'active' | 'inactive';
  approval_status?: 'pending' | 'approved' | 'rejected';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approval_note?: string | null;

  // Operational
  inspection_expiry?: string | null;
  inspectionExpiry?: string | null;
  license_plate?: string | null;
  licensePlate?: string | null;
  one_way_enabled?: boolean;
  oneWayEnabled?: boolean;
}

// ─────────────────────────────────────────────────────────────
// 3. Run-of-fleet virtual listing (extends Vehicle)
// ─────────────────────────────────────────────────────────────

/**
 * A "virtual" listing synthesised from a group of vehicles of the same
 * class at one owner's store.  It carries extra RoF-specific fields.
 */
export interface RunOfFleetListing extends Vehicle {
  /** Discriminator — always 'class_based' */
  listingType: 'class_based';
  bookingType: 'class_based';

  /** Normalised target class (e.g. 'standard') */
  targetClass: VehicleClass;

  /** vehicle_id is null until assignment */
  vehicleId: null;

  /** Number of available slots for this class+period */
  classAvailable: number;

  /** Total vehicles of this class owned by the store */
  fleetTotal: number;

  /** Discounted price (≈ 85 % of base price) */
  priceDay: number;

  /** Original per-day price before discount */
  originalPriceDay: number;
}

// ─────────────────────────────────────────────────────────────
// 4. Reservation (camelCase — frontend / API response)
// ─────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;

  // Vehicle reference (null for class-based until assigned)
  vehicleId: string | null;

  // Parties
  ownerId?: string | null;
  userId?: string | null;

  // Period
  pickup: string;   // ISO datetime
  ret: string;      // ISO datetime
  days: number;

  // Finance
  total: number;

  // Lifecycle
  status: ReservationStatus;
  type?: ServiceType;
  opts?: Record<string, unknown>;

  // Locations
  pickupLoc?: string | null;
  retLoc?: string | null;

  // Guest info (for non-logged-in bookings)
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestBookingToken?: string | null;
  contactHandles?: Record<string, string>;

  // Documents
  idpFileName?: string | null;
  idpExpiresOn?: string | null;

  // Add-ons
  drivePassId?: string | null;
  oneWayLocationId?: string | null;
  oneWayFee?: number;
  stripePaymentIntentId?: string | null;
  reviewDeadline?: string | null;
  payoutEnabled?: boolean;

  // ── Run-of-fleet fields ──────────────────────────────────────
  /** 'specific' (default) | 'class_based' */
  bookingType: BookingType;

  /**
   * Normalised vehicle class requested.
   * Required when bookingType === 'class_based', optional otherwise.
   */
  targetClass?: VehicleClass | null;

  /** 'assigned' (default) | 'pending_assignment' */
  assignmentStatus: AssignmentStatus;

  /** Timestamp when a vehicle was assigned */
  assignedAt?: string | null;

  /** UUID of the owner/system user who assigned the vehicle */
  assignedBy?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 5. DB row (snake_case — Supabase / server-side)
// ─────────────────────────────────────────────────────────────

export interface ReservationRow {
  id: string;
  vehicle_id: string | null;
  owner_id?: string | null;
  user_id?: string | null;
  pickup_at: string;
  return_at: string;
  days: number;
  total: number;
  status: ReservationStatus;
  type?: ServiceType;
  opts?: Record<string, unknown>;
  pickup_loc?: string | null;
  return_loc?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_booking_token?: string | null;
  contact_handles?: Record<string, string>;
  idp_file_name?: string | null;
  idp_expires_on?: string | null;
  drive_pass_id?: string | null;
  one_way_location_id?: string | null;
  one_way_fee?: number;
  stripe_payment_intent_id?: string | null;
  review_deadline?: string | null;
  payout_enabled?: boolean;
  created_at?: string;

  // Run-of-fleet
  booking_type: BookingType;
  target_class?: VehicleClass | null;
  assignment_status: AssignmentStatus;
  assigned_at?: string | null;
  assigned_by?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 6. POST /api/reservations — request body
// ─────────────────────────────────────────────────────────────

/** Payload sent by the frontend when creating a reservation. */
export interface CreateReservationPayload {
  id?: string;

  // ── Specific booking (vehicleId required) ──────────────────
  vehicleId?: string | null;

  // ── Class-based booking (vehicleId must be null) ───────────
  /**
   * Must be 'class_based' when sending an おまかせ予約.
   * Omit (or set 'specific') for a normal booking.
   */
  bookingType?: BookingType;
  /** Required when bookingType === 'class_based' */
  targetClass?: VehicleClass | string;

  // Common fields
  ownerId: string;
  userId?: string | null;
  pickup: string;
  ret: string;
  days: number;
  total: number;
  status?: ReservationStatus;
  type?: ServiceType;
  opts?: Record<string, unknown>;
  pickupLoc?: string;
  retLoc?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestBookingToken?: string | null;
  contactHandles?: Record<string, string>;
  idpFileName?: string | null;
  idpExpiresOn?: string | null;
  drivePassId?: string | null;
  oneWayLocationId?: string | null;
  oneWayFee?: number;
  stripePaymentIntentId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 7. Owner dashboard — available-vehicles API response
// ─────────────────────────────────────────────────────────────

export interface AvailableVehiclesResponse {
  reservationId: string;
  targetClass: VehicleClass;
  availableVehicles: Array<
    Pick<Vehicle, 'id' | 'maker' | 'model' | 'year' | 'grade' | 'cls' | 'pax' | 'fuel' | 'trans' | 'price_day' | 'img_url' | 'license_plate' | 'status' | 'approval_status' | 'owner_id'>
  >;
}

// ─────────────────────────────────────────────────────────────
// 8. Class inventory calculation result
// ─────────────────────────────────────────────────────────────

export interface ClassAvailabilityResult {
  ownerId: string;
  targetClass: VehicleClass;
  totalVehicles: number;
  specificBookedCount: number;
  classBookedCount: number;
  /** Always >= 0.  Zero means the slot is full. */
  availableCount: number;
}
