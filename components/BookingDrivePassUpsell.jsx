'use client';

import { useState } from 'react';

export default function BookingDrivePassUpsell({ reservation = {}, guest = {}, theme = {}, onDone }) {
  const [password, setPassword] = useState('');
  const [idpFileName, setIdpFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const createPass = async () => {
    setLoading(true);
    setMsg('');
    try {
      setMsg('Japan Drive Pass draft saved. Connect Supabase Auth to create the account automatically.');
      onDone?.({ password, idpFileName });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-violet-200 bg-white text-slate-950 shadow-xl shadow-violet-950/10">
      <div className="bg-gradient-to-r from-violet-700 to-indigo-600 p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-200">Fast Pickup Upgrade</p>
        <h3 className="mt-2 text-2xl font-black">Create your Japan Drive Pass</h3>
        <p className="mt-2 text-sm text-violet-100">Skip repetitive paperwork next time and qualify for Express Counter pickup.</p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Name</span>
          <input value={guest.name ?? ''} readOnly className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Email</span>
          <input value={guest.email ?? ''} readOnly className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-bold text-slate-500">Set password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" className="mt-1 w-full rounded-2xl border border-violet-200 px-4 py-3 text-sm outline-none focus:border-violet-500" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-bold text-slate-500">Upload IDP for pre-screening</span>
          <input type="file" accept="image/*,.pdf" onChange={e => setIdpFileName(e.target.files?.[0]?.name ?? '')} className="mt-1 w-full rounded-2xl border border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm" />
          {idpFileName && <p className="mt-1 text-xs font-semibold text-violet-700">{idpFileName}</p>}
        </label>
        <button onClick={createPass} disabled={!password || loading} className="sm:col-span-2 rounded-2xl px-5 py-4 text-sm font-black text-white disabled:opacity-50" style={{ background: `linear-gradient(90deg, ${theme.primary ?? '#7c3aed'}, ${theme.accent ?? '#4f46e5'})` }}>
          {loading ? 'Creating...' : 'Create Japan Drive Pass'}
        </button>
        {msg && <p className="sm:col-span-2 text-xs font-semibold text-violet-700">{msg}</p>}
      </div>
    </section>
  );
}
