// GET /api/fx — approximate FX rates, base = JPY.
// Returns { rates: { USD: 0.0064, ... }, updatedAt } where each value is
// "units of currency per 1 JPY". Tries a free public API, falls back to a
// static table so the frontend always has something to display.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const SYMBOLS = ['USD', 'EUR', 'CNY', 'KRW', 'TWD', 'HKD', 'GBP', 'AUD', 'THB', 'SGD'];

const FALLBACK = {
  USD: 0.0064, EUR: 0.0059, CNY: 0.046, KRW: 8.8, TWD: 0.205,
  HKD: 0.050, GBP: 0.0050, AUD: 0.0098, THB: 0.232, SGD: 0.0086,
};

export async function GET() {
  try {
    const res = await fetch(
      `https://api.exchangerate.host/latest?base=JPY&symbols=${SYMBOLS.join(',')}`,
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.rates && Object.keys(data.rates).length > 0) {
        return NextResponse.json({
          rates: { JPY: 1, ...data.rates },
          updatedAt: data.date ?? new Date().toISOString().slice(0, 10),
          source: 'exchangerate.host',
        });
      }
    }
  } catch (_) {}

  return NextResponse.json({
    rates: { JPY: 1, ...FALLBACK },
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'fallback',
  });
}
