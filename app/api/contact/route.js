// POST  /api/contact — submit a contact form message
// GET   /api/contact — list messages (admin inbox)
// PATCH /api/contact — mark read / delete: { id, read?, delete? }
import { NextResponse } from 'next/server';
import { getContacts, addContact, updateContact } from '../../../lib/kv';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { name, email, subject, message, honeypot } = await req.json();
    // Server-side bot & validation checks
    if (honeypot) return NextResponse.json({ ok: true }); // silently drop bots
    if (!name?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'name and message are required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email ?? '')) {
      return NextResponse.json({ error: 'invalid email' }, { status: 400 });
    }
    const saved = await addContact({
      name: String(name).slice(0, 100),
      email: String(email).slice(0, 200),
      subject: String(subject ?? '').slice(0, 200),
      message: String(message).slice(0, 4000),
    });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const list = await getContacts();
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const { id, read, delete: del } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const next = await updateContact(id, del ? { _deleted: true } : { read: Boolean(read) });
    return NextResponse.json(next);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
