'use client';

export default function EmergencySupportHub({ reservation = {}, vehicle = {}, insurance = 'Basic coverage included', onChat }) {
  const quickFacts = [
    ['Reservation', reservation.id ?? 'Not selected'],
    ['Vehicle', vehicle.maker ? `${vehicle.maker} ${vehicle.model}` : 'Vehicle details'],
    ['Insurance', insurance],
    ['Location', reservation.pickupLoc ?? vehicle.loc ?? 'Open maps for current location'],
  ];

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[28px] bg-violet-700 p-6 text-white shadow-2xl shadow-violet-900/20">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-violet-200">Emergency Support Hub</p>
          <h1 className="mt-3 text-3xl font-black">Need help now?</h1>
          <p className="mt-2 text-violet-100">Show this screen to police, emergency staff, or the rental counter.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a href="tel:110" className="rounded-3xl border border-red-100 bg-red-50 p-5 text-red-700">
            <p className="text-sm font-bold">Police</p>
            <p className="mt-1 text-4xl font-black">110</p>
          </a>
          <a href="tel:119" className="rounded-3xl border border-orange-100 bg-orange-50 p-5 text-orange-700">
            <p className="text-sm font-bold">Ambulance / Fire</p>
            <p className="mt-1 text-4xl font-black">119</p>
          </a>
        </div>

        <div className="mt-4 rounded-3xl border border-violet-100 bg-violet-50 p-4">
          <button onClick={onChat} className="w-full rounded-2xl bg-violet-700 px-5 py-4 text-lg font-black text-white shadow-lg shadow-violet-900/20">
            Contact Store Chat
          </button>
        </div>

        <dl className="mt-4 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white">
          {quickFacts.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 p-4">
              <dt className="text-sm font-bold text-slate-500">{label}</dt>
              <dd className="text-right text-sm font-black">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
