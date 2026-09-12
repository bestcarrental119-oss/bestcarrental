'use client';
/**
 * RunOfFleetAssignmentPanel
 *
 * White × purple owner panel for managing class-based (run-of-fleet) reservations.
 *
 * Anti-regression rules applied:
 *  - NEW component; OwnerDashboard.jsx is untouched except for an import + <RunOfFleetAssignmentPanel/> embed.
 *  - All fetch calls use existing API routes: GET /api/owner/reservations, GET available-vehicles, POST assign.
 *  - No schema changes; relies on booking_type, assignment_status, target_class already in DB.
 *  - All new props are optional so callers with partial data won't break.
 *
 * Usage: <RunOfFleetAssignmentPanel ownerId={…} currentUserId={…} onAssigned={…} />
 */
import { useState, useEffect, useCallback } from 'react';
import { classLabel, normalizeVehicleClass } from '../lib/runOfFleet';
import { useI18n } from '../lib/i18nContext';

// ─── tiny helpers ──────────────────────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function days(pickup, ret, t) {
  if (!pickup || !ret) return '—';
  return t('ac_nights').replace('{n}', Math.round((new Date(ret) - new Date(pickup)) / 86400000));
}
function reservationVehicleId(r) {
  return r?.vehicle_id ?? r?.vehicleId ?? null;
}

// Status badge config
const STATUS_BADGE = {
  pending_assignment: { labelKey: 'rof_stActionNeeded', cls: 'bg-purple-100 text-purple-800 border border-purple-300' },
  assigned:           { labelKey: 'rof_stAssigned', cls: 'bg-green-100  text-green-800  border border-green-300' },
  confirmed:          { labelKey: 'rof_stConfirmed', cls: 'bg-blue-100   text-blue-800   border border-blue-300' },
  cancelled:          { labelKey: 'rof_stCancelled', cls: 'bg-red-100    text-red-800    border border-red-300' },
};
function StatusBadge({ status }) {
  const { t } = useI18n();
  const cfg = STATUS_BADGE[status] ?? { labelKey: null, cls: 'bg-gray-100 text-gray-700 border border-gray-200' };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>{cfg.labelKey ? t(cfg.labelKey) : status}</span>;
}

// CLASS icon / colour map
const CLASS_COLOR = {
  kei:            { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-200',     icon: 'K' },
  compact:        { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'S' },
  standard:       { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200',  icon: 'G' },
  suv:            { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200',    icon: 'SUV' },
  minivan:        { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   icon: 'F1' },
  luxury_minivan: { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200',  icon: 'F2' },
  other:          { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200',    icon: 'V' },
};
function ClassPill({ cls }) {
  const normalized = normalizeVehicleClass(cls);
  const c = CLASS_COLOR[normalized] ?? { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', icon: 'G' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      {c.icon} {classLabel(normalized)}
    </span>
  );
}

// ─── Modal: assign vehicle ──────────────────────────────────────────────────────
function AssignModal({ reservation, ownerId, currentUserId, onClose, onAssigned }) {
  const { t } = useI18n();
  const [vehicles, setVehicles]   = useState([]);
  const [selected, setSelected]   = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Load available vehicles for this reservation
  useEffect(() => {
    if (!reservation?.id) return;
    setLoading(true);
    fetch(`/api/owner/reservations/${reservation.id}/available-vehicles?ownerId=${ownerId}`)
      .then(r => r.json())
      .then(d => { setVehicles(d.availableVehicles ?? []); setLoading(false); })
      .catch(() => { setError(t('rof_errFetchVehicles')); setLoading(false); });
  }, [reservation?.id, ownerId]);

  const handleAssign = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/owner/reservations/${reservation.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selected, ownerId, assignedBy: currentUserId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('rof_errGeneric'));
      onAssigned(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-purple-100 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-purple-100 flex items-start justify-between"
             style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)' }}>
          <div>
            <h3 className="text-gray-900 font-bold text-base">{t('rof_assignVehicle')}</h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {t('rof_reservation')} #{reservation?.id?.slice(0, 8)} · <ClassPill cls={reservation?.target_class ?? reservation?.targetClass ?? 'standard'} />
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none mt-0.5">✕</button>
        </div>

        {/* Reservation summary */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-400">{t('rof_pickup')}</p>
            <p className="text-sm font-semibold text-gray-800">{fmt(reservation?.pickup_at ?? reservation?.pickup)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('rof_return')}</p>
            <p className="text-sm font-semibold text-gray-800">{fmt(reservation?.return_at ?? reservation?.ret)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('rof_period')}</p>
            <p className="text-sm font-semibold text-gray-800">{days(reservation?.pickup_at ?? reservation?.pickup, reservation?.return_at ?? reservation?.ret, t)}</p>
          </div>
        </div>

        {/* Vehicle list */}
        <div className="px-6 py-4 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">{t('mp_loading')}</div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">😔</div>
              <p className="text-gray-500 text-sm">{t('rof_noVehicles')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vehicles.map(veh => (
                <label
                  key={veh.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selected === veh.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="vehicle"
                    value={veh.id}
                    checked={selected === veh.id}
                    onChange={() => setSelected(veh.id)}
                    className="accent-purple-600"
                  />
                  {veh.img_url ? (
                    <img src={veh.img_url} alt="" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">🚗</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm">{veh.maker} {veh.model}</p>
                    <p className="text-gray-500 text-xs">{veh.year}{t('fa_yearSuffix')} · {veh.grade ?? veh.cls}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <ClassPill cls={veh.cls} />
                    {veh.license_plate && (
                      <p className="text-gray-400 text-[10px] mt-0.5">{veh.license_plate}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose}
                  className="px-5 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            {t('mp_cancel')}
          </button>
          <button
            onClick={handleAssign}
            disabled={!selected || saving}
            className="px-6 py-2 text-sm font-bold text-white rounded-xl disabled:opacity-40 hover:brightness-110 transition-all shadow-md shadow-purple-200/60"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
          >
            {saving ? t('rof_assigning') : t('rof_confirmAssign')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────
export default function RunOfFleetAssignmentPanel({ ownerId, currentUserId, onAssigned }) {
  const { t } = useI18n();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [assigning, setAssigning]       = useState(null);   // reservation being assigned
  const [tab, setTab]                   = useState('pending'); // 'pending' | 'all'
  const [successId, setSuccessId]       = useState('');

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/owner/reservations?ownerId=${ownerId}`);
      const data = await res.json();
      // Keep only class-based reservations
      const classBased = (Array.isArray(data) ? data : []).filter(
        r => (r.booking_type ?? r.bookingType) === 'class_based',
      );
      setReservations(classBased);
    } catch {
      setError(t('rof_errFetchReservations'));
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const pending = reservations.filter(
    r => (r.assignment_status ?? r.assignmentStatus) === 'pending_assignment' && !reservationVehicleId(r),
  );
  const displayed = tab === 'pending' ? pending : reservations;

  const handleAssigned = async (updated) => {
    setAssigning(null);
    setSuccessId(updated.id ?? '');
    await load();
    await onAssigned?.(updated);
    setTimeout(() => setSuccessId(''), 3000);
  };

  return (
    <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="px-6 py-5 border-b border-purple-100"
           style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-gray-900 font-black text-lg flex items-center gap-2">
              {t('rof_title')}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {t('rof_subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
                {t('rof_needAction').replace('{n}', pending.length)}
              </span>
            )}
            <button onClick={load}
                    className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
              {t('rof_refresh')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { id: 'pending', label: t('rof_tabPending').replace('{n}', pending.length) },
            { id: 'all',     label: t('rof_tabAll').replace('{n}', reservations.length) },
          ].map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === tb.id
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-3xl mb-2 animate-spin inline-block">⏳</div>
            <p className="text-sm">{t('mp_loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-gray-500 text-sm font-medium">
              {tab === 'pending' ? t('rof_allAssigned') : t('rof_noOmakase')}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('rof_thId')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('rof_thClass')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('rof_period')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('rof_thTotal')}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('rof_thStatus')}</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('rof_thAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map(r => {
                const assignedVehicleId = reservationVehicleId(r);
                const isPending = (r.assignment_status ?? r.assignmentStatus) === 'pending_assignment' && !assignedVehicleId;
                const isSuccess = successId === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`transition-colors ${
                      isSuccess  ? 'bg-green-50' :
                      isPending  ? 'bg-purple-50/60 hover:bg-purple-50' :
                                   'hover:bg-gray-50'
                    }`}
                  >
                    {/* ID */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 animate-pulse" />
                        )}
                        <span className="font-mono text-xs text-gray-700 font-semibold">
                          #{r.id?.slice(0, 8)}
                        </span>
                      </div>
                      {(r.guest_name ?? r.guestName) && (
                        <p className="text-xs text-gray-400 mt-0.5">{r.guest_name ?? r.guestName}</p>
                      )}
                    </td>

                    {/* Class */}
                    <td className="px-5 py-4">
                      <ClassPill cls={r.target_class ?? r.targetClass ?? 'standard'} />
                    </td>

                    {/* Period */}
                    <td className="px-5 py-4">
                      <p className="text-gray-800 font-medium text-xs">
                        {fmt(r.pickup_at ?? r.pickup)}
                      </p>
                      <p className="text-gray-400 text-xs">
                        〜 {fmt(r.return_at ?? r.ret)}
                      </p>
                      <p className="text-purple-600 text-xs font-semibold mt-0.5">
                        {days(r.pickup_at ?? r.pickup, r.return_at ?? r.ret, t)}
                      </p>
                    </td>

                    {/* Total */}
                    <td className="px-5 py-4">
                      <span className="text-gray-900 font-bold">¥{(r.total ?? 0).toLocaleString()}</span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <StatusBadge status={r.assignment_status ?? r.assignmentStatus ?? r.status} />
                      {isSuccess && (
                        <p className="text-green-600 text-xs mt-1 font-semibold">{t('rof_assignDone')}</p>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 text-right">
                      {isPending ? (
                        <button
                          onClick={() => setAssigning(r)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl
                                     hover:brightness-110 transition-all shadow-sm shadow-purple-200/60 active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
                        >
                          {t('rof_assignVehicle')}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          {assignedVehicleId ? t('rof_stAssigned') : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Assign modal */}
      {assigning && (
        <AssignModal
          reservation={assigning}
          ownerId={ownerId}
          currentUserId={currentUserId}
          onClose={() => setAssigning(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
