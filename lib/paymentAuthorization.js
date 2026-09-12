export const AUTHORIZED_PAYMENT_STATUS = 'authorized';
export const CANCEL_FEE_CAPTURED_PAYMENT_STATUS = 'cancel_fee_captured';
export const RELEASED_PAYMENT_STATUS = 'released';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function calcCancelFeeForTime(baseAmount, pickupDateStr, now = new Date()) {
  const amount = Math.max(0, Math.round(Number(baseAmount ?? 0)));
  const pickup = new Date(pickupDateStr);
  if (Number.isNaN(pickup.getTime())) return amount;
  if (pickup.getTime() <= now.getTime()) return amount;

  const daysLeft = Math.round((startOfLocalDay(pickup) - startOfLocalDay(now)) / DAY_MS);
  if (daysLeft >= 7) return 0;
  if (daysLeft >= 2) return Math.round(amount * 0.30);
  if (daysLeft === 1) return Math.round(amount * 0.50);
  return Math.round(amount * 0.80);
}

export function buildReservationAuthorizationIntentParams({
  amount,
  customerId,
  paymentMethodId,
  reservationId,
}) {
  return {
    amount: Math.round(Number(amount ?? 0)),
    currency: 'jpy',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    capture_method: 'manual',
    payment_method_options: {
      card: {
        request_extended_authorization: 'if_available',
      },
    },
    expand: ['latest_charge'],
    metadata: {
      platform: 'best-car-rental',
      reservationId: String(reservationId),
      kind: 'scheduled-authorization',
    },
  };
}

export function extractAuthorizationDetails(paymentIntent) {
  const latestCharge = typeof paymentIntent?.latest_charge === 'object'
    ? paymentIntent.latest_charge
    : null;
  const card = latestCharge?.payment_method_details?.card ?? null;
  const captureBeforeUnix = Number(card?.capture_before ?? 0);

  return {
    captureBefore: captureBeforeUnix > 0 ? new Date(captureBeforeUnix * 1000).toISOString() : null,
    extendedStatus: card?.extended_authorization?.status ?? null,
    amountCapturable: Number(paymentIntent?.amount_capturable ?? 0),
  };
}

export function stripeIdempotencyKey(kind, reservationId) {
  return `best-car-rental:${kind}:${reservationId}:v1`;
}
