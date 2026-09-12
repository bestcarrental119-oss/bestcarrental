// /api/cards — list / save / remove a user's saved payment methods.
//
//   GET    /api/cards?userId=123                 → { cards: [...] }
//   POST   /api/cards  { userId, customerId? }   → syncs masked details from
//                                                   Stripe (if configured), saves
//   DELETE /api/cards?userId=123&cardId=card_x   → { cards: [...] }
//
// Card objects only ever hold masked data: { brand, last4, expMonth, expYear,
// paymentMethodId, customerId }. No raw card numbers are stored.
import { NextResponse } from 'next/server';
import { getCards, saveCardKv, deleteCardKv } from '../../../lib/kv';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cards = await getCards(searchParams.get('userId'));
  return NextResponse.json({ cards });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, customerId } = body;
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    let card = body.card ?? null;

    if (!card && customerId && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
        const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
        const pm = pms.data[0];
        if (pm) {
          card = {
            brand: pm.card.brand, last4: pm.card.last4,
            expMonth: pm.card.exp_month, expYear: pm.card.exp_year,
            paymentMethodId: pm.id, customerId,
          };
        }
      } catch (e) {
        console.warn('[api/cards] Stripe sync failed:', e.message);
      }
    }

    if (!card) {
      card = { brand: body.brand ?? 'card', last4: body.last4 ?? '••••', customerId: customerId ?? null, demo: true };
    }

    const cards = await saveCardKv(userId, card);
    return NextResponse.json({ cards });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const cardId = searchParams.get('cardId');

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const cards = await getCards(userId);
      const target = cards.find(c => c.id === cardId);
      if (target?.paymentMethodId) {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
        await stripe.paymentMethods.detach(target.paymentMethodId).catch(() => {});
      }
    } catch (_) {}
  }

  const cards = await deleteCardKv(userId, cardId);
  return NextResponse.json({ cards });
}
