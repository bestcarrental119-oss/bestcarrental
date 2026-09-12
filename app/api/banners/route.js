import { NextResponse } from 'next/server';
import { INIT_HERO_BANNERS } from '../../../lib/data';
import { getHeroBanners, saveHeroBanners } from '../../../lib/kv';

export const dynamic = 'force-dynamic';

const MAX_BANNER_COUNT = 8;
const MAX_IMAGE_BYTES = 1024 * 1024;
const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;

export async function GET() {
  const banners = await getHeroBanners();
  return NextResponse.json({ banners });
}

export async function POST(req) {
  try {
    const { banners } = await req.json();
    const next = validateBanners(banners);
    await saveHeroBanners(next);
    return NextResponse.json({ banners: next });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

function validateBanners(banners) {
  if (!Array.isArray(banners)) throw new Error('banners must be an array');
  if (banners.length === 0) throw new Error('at least one banner is required');
  if (banners.length > MAX_BANNER_COUNT) throw new Error(`max ${MAX_BANNER_COUNT} banners`);

  return banners.map((banner, index) => {
    const src = String(banner?.src ?? '');
    if (!isAllowedSrc(src)) throw new Error(`invalid banner source at ${index + 1}`);
    if (src.startsWith('data:') && dataUrlBytes(src) > MAX_IMAGE_BYTES) {
      throw new Error(`banner ${index + 1} is too large`);
    }

    return {
      id: String(banner?.id || `hero-banner-${index + 1}`),
      src,
      alt: String(banner?.alt || `BEST Car Rental banner ${index + 1}`).slice(0, 120),
    };
  });
}

function isAllowedSrc(src) {
  return src.startsWith('/hero-banner-')
    || src.startsWith('/uploads/')
    || src.startsWith('https://')
    || DATA_IMAGE_RE.test(src);
}

function dataUrlBytes(src) {
  const base64 = src.split(',')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}
