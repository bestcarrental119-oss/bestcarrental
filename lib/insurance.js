// ── Insurance / Collision Damage Waiver plans ─────────────────────────────────
// Four fixed-price coverage tiers offered to renters. Prices are per 24h and are
// the same for every vehicle. Owners choose WHICH of the three paid tiers they
// offer for each vehicle (see `offeredPlans`). The base tier is always available.
//
// Coverage matrix — for each accident scenario, whether each liability item is
// covered (true = 負担0円 / covered by the plan) or self-paid (false):
//   items:  liability (対物免責), vehicle (車両免責), noc (NOC = 営業補償料)
//   scenarios: other (相手がいる事故・飛び石) / self (自損事故・当て逃げ)
//   each item cap is ¥50,000, so max out-of-pocket = 50,000 × (# self-paid items)

export const INSURANCE_ITEMS = ['liability', 'vehicle', 'noc'];
export const INSURANCE_ITEM_CAP = 50000;

export const INSURANCE_PLANS = [
  {
    id: 'basic',
    price: 0,
    accent: '#6b7280',
    coverage: {
      other: { liability: false, vehicle: false, noc: false },
      self: { liability: false, vehicle: false, noc: false },
    },
    maxPayout: { other: 150000, self: 150000 },
  },
  {
    id: 'waiver',
    price: 1100,
    accent: '#3b82f6',
    coverage: {
      other: { liability: true, vehicle: true, noc: false },
      self: { liability: true, vehicle: false, noc: false },
    },
    maxPayout: { other: 50000, self: 100000 },
  },
  {
    id: 'waiverPlus',
    price: 1650,
    accent: '#8b5cf6',
    coverage: {
      other: { liability: true, vehicle: true, noc: true },
      self: { liability: true, vehicle: false, noc: true },
    },
    maxPayout: { other: 0, self: 50000 },
  },
  {
    id: 'perfect',
    price: 2200,
    accent: '#10b981',
    recommended: true,
    coverage: {
      other: { liability: true, vehicle: true, noc: true },
      self: { liability: true, vehicle: true, noc: true },
    },
    maxPayout: { other: 0, self: 0 },
  },
];

// The three paid tiers an owner can choose to offer.
export const PAID_PLAN_IDS = ['waiver', 'waiverPlus', 'perfect'];

// Items shared across every plan that are never covered.
export const INSURANCE_EXCLUSION_KEYS = [
  'ins_excl_stone',
  'ins_excl_tire',
  'ins_excl_wheel',
  'ins_excl_interior',
  'ins_excl_tow',
];

export function findPlan(id) {
  return INSURANCE_PLANS.find(p => p.id === id) ?? null;
}

// Normalize an owner's stored selection into an array of paid plan ids.
export function normalizeOfferedPlanIds(raw) {
  if (raw == null) return [...PAID_PLAN_IDS]; // legacy vehicles: offer all
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { list = raw.split(',').map(s => s.trim()); }
  }
  if (!Array.isArray(list)) return [...PAID_PLAN_IDS];
  return list.filter(id => PAID_PLAN_IDS.includes(id));
}

// Full list of plans a renter may pick for a given vehicle (base + owner's picks).
export function offeredPlans(vehicle) {
  const raw = vehicle?.insurancePlans ?? vehicle?.insurance_plans;
  const paid = normalizeOfferedPlanIds(raw);
  return INSURANCE_PLANS.filter(p => p.id === 'basic' || paid.includes(p.id));
}

// Resolve the plan a renter selected in the booking `opts`, falling back to base.
export function selectedPlan(vehicle, opts) {
  const plans = offeredPlans(vehicle);
  const chosen = plans.find(p => p.id === opts?.insurancePlan);
  return chosen ?? plans[0];
}
