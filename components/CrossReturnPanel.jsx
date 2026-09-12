'use client';
import { useEffect, useState, useCallback } from 'react';
import { Modal } from './Shared';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import CrossReturnMapPicker from './CrossReturnMapPicker';
import CrossReturnDestMap, { feeLabel } from './CrossReturnDestMap';
import DamageInspection from './DamageInspection';
import {
  BEST_GO_WORKFLOW_STEPS,
  bestGoInspectionAction,
  bestGoWorkflowState,
  coerceCrossReturnBaseFee,
  coerceExpectedStorageDays,
  draftNumberInputValue,
  groupCrossReturnJobs,
  homeReturnStatusOf,
} from '../lib/crossReturn';

const yen = n => `¥${Number(n || 0).toLocaleString()}`;

function BestGoJobTimeline({ job, t, accent }) {
  const current = bestGoWorkflowState(job);
  const activeIndex = Math.max(0, BEST_GO_WORKFLOW_STEPS.findIndex(step => step.key === current.activeStep));
  return (
    <div data-best-go-job-timeline className="mt-3 rounded-2xl border border-gray-800 bg-gray-950/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-500">{t('cr_flowCurrent')}</p>
        <span className="rounded-full bg-purple-500/15 px-2.5 py-1 text-[11px] font-black text-purple-200">{t(current.statusKey)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {BEST_GO_WORKFLOW_STEPS.map((step, index) => {
          const active = index === activeIndex;
          const done = index < activeIndex;
          return (
            <div
              key={step.key}
              className={`min-h-[4.25rem] rounded-xl border px-2 py-2 ${
                active ? 'border-purple-500 bg-purple-500/15' : done ? 'border-emerald-800/70 bg-emerald-950/20' : 'border-gray-800 bg-gray-900/60'
              }`}
            >
              <div
                className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                  active ? 'text-white' : done ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500'
                }`}
                style={active ? { background: accent } : {}}
              >
                {done ? '✓' : index + 1}
              </div>
              <p className={`text-[10px] font-bold leading-snug ${active ? 'text-white' : done ? 'text-emerald-200' : 'text-gray-500'}`}>
                {t(step.labelKey)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 共有写真ビューア（AI点検の貸出前/返却＋引き渡し写真）
function SharedPhotos({ data, t, onClose }) {
  const inspections = Array.isArray(data?.inspections) && data.inspections.length > 0
    ? data.inspections
    : (data?.inspection ? [{ ...data.inspection, leg: 'reservation' }] : []);
  const handover = data?.handover ?? [];
  const posLabel = (id) => { const l = t(`di_pos_${id}`); return l === `di_pos_${id}` ? id : l; };
  const inspectionTitle = (insp) => {
    if (insp?.leg === 'outbound') return t('cr_inspectionOutboundTitle');
    if (insp?.leg === 'homeward') return t('cr_inspectionHomewardTitle');
    return t('sc_inspTitle');
  };
  return (
    <Modal open onClose={onClose} wide>
      <div className="p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white">🖼 {t('cr_sharedPhotos')}</h3>

        {inspections.length > 0 ? (
          <div className="mt-3 space-y-4">
            {inspections.map(insp => {
              const positions = insp?.photos ? Object.keys(insp.photos) : [];
              return (
                <div key={insp.id ?? insp.leg} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-white">{inspectionTitle(insp)}</p>
                    {insp?.estCost > 0 && (
                      <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-black text-red-300">{t('sc_inspEstCost')}: {yen(insp.estCost)}</span>
                    )}
                  </div>
                  {positions.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {positions.map(id => (
                        <div key={id} className="rounded-xl border border-gray-800 bg-gray-800/30 p-2">
                          <p className="mb-1 text-xs font-semibold text-white">{posLabel(id)}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="mb-1 text-[10px] text-gray-400">{t('cr_inspectionDeparturePhase')}</p>
                              {insp.photos[id]?.before
                                ? <img src={insp.photos[id].before} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                                : <div className="flex aspect-[4/3] w-full items-center justify-center rounded bg-gray-900 text-xs text-gray-600">—</div>}
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] text-gray-400">{t('cr_inspectionArrivalPhase')}</p>
                              {insp.photos[id]?.after
                                ? <img src={insp.photos[id].after} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                                : <div className="flex aspect-[4/3] w-full items-center justify-center rounded bg-gray-900 text-xs text-gray-600">—</div>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t('cr_noInspection')}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">{t('cr_noInspection')}</p>
        )}

        {handover.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold text-gray-400">📷 {t('ps_photos')}</p>
            <div className="flex flex-wrap gap-2">
              {handover.map((p, i) => (
                <a key={i} href={p.url || p.dataUrl} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-lg border border-gray-800">
                  <img src={p.url || p.dataUrl} alt={p.phase} className="h-24 w-32 object-cover" />
                  <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${p.phase === 'return' ? 'bg-sky-600' : 'bg-emerald-600'}`}>
                    {p.phase === 'return' ? t('ps_returnPhoto') : t('ps_pickupPhoto')}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function CrossReturnPanel({ ownerId, reservations = [], vehicles = [], theme, activeSection = 'accept' }) {
  const { dispatch } = useApp();
  const { t } = useI18n();

  const [settings, setSettings] = useState(null);
  const [receivers, setReceivers] = useState([]);
  const [list, setList] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [vehDests, setVehDests] = useState({}); // { vehicleId: string[] receivingOwnerIds }
  const [vehDays, setVehDays] = useState({});   // { vehicleId: expectedStorageDays }
  const [vehBaseFees, setVehBaseFees] = useState({}); // { vehicleId: baseFee charged to the customer }
  const [savingVeh, setSavingVeh] = useState(null);
  const [mapVehicle, setMapVehicle] = useState(null); // 地図で選ぶ対象の車両
  const [crSearch, setCrSearch] = useState('');       // 車両検索
  const [inspectionTarget, setInspectionTarget] = useState(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const [s, rc, ls] = await Promise.all([
        fetch(`/api/owner/cross-return?ownerId=${ownerId}&mode=settings&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/owner/cross-return?ownerId=${ownerId}&mode=receivers&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/owner/cross-return?ownerId=${ownerId}&mode=list&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()),
      ]);
      setSettings(s && !s.error ? s : null);
      setReceivers(Array.isArray(rc) ? rc : []);
      setList(Array.isArray(ls) ? ls : []);
    } catch { /* ignore */ }
  }, [ownerId]);
  useEffect(() => { load(); }, [load]);

  // 各車両の現在の返却先を取得
  useEffect(() => {
    if (!vehicles.length) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(vehicles.map(async v => {
        try {
          const d = await fetch(`/api/owner/cross-return?ownerId=${ownerId}&mode=vehicle-dests&vehicleId=${v.id}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json());
          const receiverIds = Array.isArray(d) ? d.map(String) : (Array.isArray(d?.receiverIds) ? d.receiverIds.map(String) : []);
          const days = Number(d?.expectedDays ?? 1) || 1;
          const baseFee = Math.max(0, Math.round(Number(d?.baseFee) || 0));
          return [String(v.id), receiverIds, days, baseFee];
        } catch { return [String(v.id), [], 1, 0]; }
      }));
      if (alive) {
        setVehDests(Object.fromEntries(entries.map(e => [e[0], e[1]])));
        setVehDays(Object.fromEntries(entries.map(e => [e[0], e[2]])));
        setVehBaseFees(Object.fromEntries(entries.map(e => [e[0], e[3]])));
      }
    })();
    return () => { alive = false; };
  }, [vehicles, ownerId]);

  const patchSetting = (patch) => setSettings(s => ({ ...(s ?? {}), ...patch }));

  const toggleVehDest = (vehicleId, recvId) => setVehDests(prev => {
    const cur = new Set(prev[String(vehicleId)] ?? []);
    cur.has(String(recvId)) ? cur.delete(String(recvId)) : cur.add(String(recvId));
    return { ...prev, [String(vehicleId)]: [...cur] };
  });

  const saveVehDests = async (vehicleId) => {
    setSavingVeh(String(vehicleId));
    try {
      const res = await fetch('/api/owner/cross-return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vehicle-dests',
          vehicleId,
          originOwnerId: ownerId,
          receiverIds: vehDests[String(vehicleId)] ?? [],
          expectedDays: coerceExpectedStorageDays(vehDays[String(vehicleId)]),
          baseFee: coerceCrossReturnBaseFee(vehBaseFees[String(vehicleId)]),
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'save failed'); }
      dispatch({ type: 'TOAST', msg: t('cr_saved') });
    } catch (e) { dispatch({ type: 'TOAST', msg: e.message }); }
    finally { setSavingVeh(null); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/owner/cross-return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settings', ownerId, ...settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'save failed');
      setSettings(data);
      dispatch({ type: 'TOAST', msg: t('cr_saved') });
      load();
    } catch (e) {
      dispatch({ type: 'TOAST', msg: e.message });
    } finally { setSavingSettings(false); }
  };

  const patchArrangement = async (id, patch) => {
    try {
      const res = await fetch('/api/owner/cross-return', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ownerId, ...patch }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'update failed'); }
      load();
    } catch (e) { dispatch({ type: 'TOAST', msg: e.message }); }
  };

  const requestStaffReturn = (id) => patchArrangement(id, { action: 'request-staff-return' });
  const requestHomeReturnOneWay = (id) => patchArrangement(id, { action: 'request-one-way-return' });
  const startStaffReturn = (id) => patchArrangement(id, { action: 'start-staff-return' });
  const publishHomeReturnOneWay = (id) => patchArrangement(id, { action: 'publish-home-return-one-way' });
  const markReturnedHome = (id) => patchArrangement(id, { action: 'mark-returned-home' });

  const openInspection = (job) => {
    const action = bestGoInspectionAction(job);
    if (!action) return;
    setInspectionTarget({
      id: action.inspectionId,
      inspectionId: action.inspectionId,
      originalReservationId: job.reservationId,
      inspectionPhase: action.phase,
      inspectionLabels: {
        title: t(action.titleKey),
        hint: t(action.hintKey),
        beforeLabel: t('cr_inspectionDeparturePhase'),
        afterLabel: t('cr_inspectionArrivalPhase'),
      },
    });
  };

  const recvLabel = (rc) => rc.feeMode === 'storage'
    ? `${rc.storeName} · ${t('cr_storage')} ${yen(rc.storagePerDay)}/${t('cr_perDay')}`
    : `${rc.storeName} · ${t('cr_split')} ${rc.splitType === 'fixed' ? yen(rc.splitValue) : `${rc.splitValue}%`}`;

  const statusColor = (s) => ({
    requested: 'bg-amber-500/20 text-amber-300', accepted: 'bg-blue-500/20 text-blue-300',
    received: 'bg-purple-500/20 text-purple-300', settled: 'bg-emerald-500/20 text-emerald-300',
    cancelled: 'bg-gray-600/30 text-gray-400',
  }[s] ?? 'bg-gray-600/30 text-gray-400');

  const grouped = groupCrossReturnJobs(list);
  const sendableJobs = [
    ...grouped.holdingOtherVehicles,
    ...grouped.returnRequests,
    ...grouped.staffReturning,
    ...grouped.oneWayReturning,
  ];
  const operationSections = [
    { key: 'incoming', title: t('cr_opsIncoming'), items: grouped.incomingScheduled },
    { key: 'away', title: t('cr_opsAwayHolding'), items: grouped.awaitingReturnRequest },
    { key: 'holding', title: t('cr_opsHolding'), items: grouped.holdingOtherVehicles },
    { key: 'requests', title: t('cr_opsReturnRequests'), items: grouped.returnRequests },
    { key: 'staff', title: t('cr_opsStaffReturning'), items: grouped.staffReturning },
    { key: 'oneway', title: t('cr_opsOneWayReturning'), items: grouped.oneWayReturning },
    { key: 'home', title: t('cr_opsReturnedHome'), items: grouped.returnedHome },
    { key: 'settlement', title: t('cr_opsSettlement'), items: grouped.settlement },
    { key: 'other', title: t('cr_opsOther'), items: grouped.other },
  ].filter(sec => sec.items.length > 0 || sec.key === 'incoming' || sec.key === 'holding');
  const g = theme?.accent ?? '#a855f7';

  const inp = 'w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none';
  const showAllSections = activeSection === 'all';
  const showAcceptSection = showAllSections || activeSection === 'accept';
  const showVehiclesSection = showAllSections || activeSection === 'vehicles';
  const showSendSection = showAllSections || activeSection === 'send';
  const showOpsSection = showAllSections || activeSection === 'ops';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white text-lg font-bold">🔁 {t('cr_title')}</h2>
        <p className="text-gray-400 text-sm mt-1">{t('cr_desc')}</p>
      </div>

      {/* ── 受け入れ設定 ─────────────────────────────── */}
      {showAcceptSection && (
      <div data-best-go-section="accept" className="scroll-mt-24 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-sm font-bold text-white">{t('cr_acceptToggle')}</span>
          <input type="checkbox" checked={!!settings?.enabled} onChange={e => patchSetting({ enabled: e.target.checked })} className="h-5 w-5 accent-purple-500" />
        </label>
        <p className="mt-1 text-xs text-gray-500">{t('cr_acceptHint')}</p>

        {settings?.enabled && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-400">{t('cr_location')}</label>
              <CrossReturnMapPicker
                value={{ location: settings.location, lat: settings.lat, lng: settings.lng }}
                onChange={(v) => patchSetting({ location: v.location, lat: v.lat, lng: v.lng })}
                t={t}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">{t('cr_feeMode')}</label>
              <div className="flex gap-2">
                {['storage', 'split'].map(m => (
                  <button key={m} onClick={() => patchSetting({ feeMode: m })}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${settings.feeMode === m ? 'text-white' : 'bg-gray-800 text-gray-400'}`}
                    style={settings.feeMode === m ? { background: g } : {}}>
                    {m === 'storage' ? t('cr_storage') : t('cr_split')}
                  </button>
                ))}
              </div>
            </div>

            {settings.feeMode === 'storage' ? (
              <div>
                <label className="mb-1 block text-xs text-gray-400">{t('cr_storagePerDay')}</label>
                <input type="number" min="0" value={settings.storagePerDay ?? 0} onChange={e => patchSetting({ storagePerDay: e.target.value })} className={inp} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">{t('cr_splitType')}</label>
                  <select value={settings.splitType ?? 'percent'} onChange={e => patchSetting({ splitType: e.target.value })} className={inp}>
                    <option value="percent">{t('cr_percent')}</option>
                    <option value="fixed">{t('cr_fixed')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">{settings.splitType === 'fixed' ? t('cr_amountYen') : t('cr_percentVal')}</label>
                  <input type="number" min="0" value={settings.splitValue ?? 0} onChange={e => patchSetting({ splitValue: e.target.value })} className={inp} />
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={saveSettings} disabled={savingSettings} className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: g }}>
          {savingSettings ? '…' : `💾 ${t('cr_saveSettings')}`}
        </button>
      </div>
      )}

      {/* ── 車ごとの返却先を指定 ─────────────────────── */}
      {showVehiclesSection && (
      <div data-best-go-section="vehicles" className="scroll-mt-24 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm font-bold text-white">🚗 {t('cr_vehDestTitle')}</p>
        <p className="mt-1 mb-3 text-xs text-gray-500">{t('cr_vehDestHint')}</p>
        {receivers.length === 0 ? (
          <p className="text-xs text-gray-500">{t('cr_noReceivers')}</p>
        ) : vehicles.length === 0 ? (
          <p className="text-xs text-gray-500">{t('od_registerVehicleFirst')}</p>
        ) : (
          <div className="space-y-3">
            {vehicles.length > 3 && (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                <input value={crSearch} onChange={e => setCrSearch(e.target.value)} placeholder={t('od_vehicleSearchPh')}
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 py-2 pl-9 pr-8 text-sm text-white focus:border-purple-500 focus:outline-none" />
                {crSearch && <button onClick={() => setCrSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">✕</button>}
              </div>
            )}
            {vehicles.filter(v => {
              const q = crSearch.trim().toLowerCase();
              return !q || [v.maker, v.model, v.grade, v.licensePlate, v.license_plate, v.year, v.cls].filter(Boolean).some(x => String(x).toLowerCase().includes(q));
            }).map(v => {
              const sel = new Set(vehDests[String(v.id)] ?? []);
              const img = v.img ?? v.img_url ?? v.image_url ?? v.imageUrl;
              return (
                <div key={v.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                  <div className="mb-2 flex items-center gap-3">
                    {img
                      ? <img src={img} alt="" className="h-12 w-16 flex-shrink-0 rounded-lg object-cover" />
                      : <span className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-800 text-xl">🚗</span>}
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{v.maker} {v.model} <span className="text-xs text-gray-500">{sel.size > 0 ? `· ${sel.size}` : ''}</span></p>
                    <button onClick={() => setMapVehicle(v)}
                      className="flex-shrink-0 rounded-lg border border-purple-600 px-2.5 py-1 text-xs font-bold text-purple-200 active:scale-95">
                      🗺 {t('cr_pickOnMap')}
                    </button>
                    <button onClick={() => saveVehDests(v.id)} disabled={savingVeh === String(v.id)}
                      className="flex-shrink-0 rounded-lg border border-gray-600 px-2.5 py-1 text-xs font-bold text-gray-200 active:scale-95 disabled:opacity-50">
                      {savingVeh === String(v.id) ? '…' : `💾 ${t('od_save')}`}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {receivers.map(rc => (
                      <label key={rc.ownerId} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                        sel.has(String(rc.ownerId)) ? 'border-purple-500 bg-purple-900/15 text-purple-100' : 'border-gray-700 text-gray-300'
                      }`}>
                        <input type="checkbox" checked={sel.has(String(rc.ownerId))} onChange={() => toggleVehDest(v.id, rc.ownerId)} className="h-4 w-4 accent-purple-500" />
                        <span className="min-w-0 flex-1 truncate">{rc.storeName}{rc.location ? ` · ${rc.location}` : ''}</span>
                        <span className="flex-shrink-0 font-bold text-purple-200">{feeLabel(rc, t)}</span>
                      </label>
                    ))}
                  </div>
                  {/* 保管料モードの受け入れ先が選ばれている場合：想定保管日数（元オーナーが設定） */}
                  {receivers.some(rc => sel.has(String(rc.ownerId)) && rc.feeMode === 'storage') && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-gray-400">{t('cr_expectedDays')}</label>
                      <input type="number" min="1" value={draftNumberInputValue(vehDays[String(v.id)], 1)}
                        onChange={e => setVehDays(prev => ({ ...prev, [String(v.id)]: e.target.value }))}
                        className="w-20 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-white" />
                      <span className="text-[10px] text-gray-500">{t('cr_expectedDaysHint')}</span>
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                    <label className="text-xs text-gray-400">{t('cr_baseFee')}</label>
                    <div>
                      <input
                        type="number"
                        min="0"
                        value={draftNumberInputValue(vehBaseFees[String(v.id)], 0)}
                        onChange={e => setVehBaseFees(prev => ({ ...prev, [String(v.id)]: e.target.value }))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white sm:w-36"
                      />
                      <p className="mt-1 text-[10px] text-gray-500">{t('cr_baseFeeHint')}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ── 他拠点に返す（送り出し作成）────────────────── */}
      {showSendSection && (
      <div data-best-go-section="send" className="scroll-mt-24 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm font-bold text-white">↗️ {t('cr_sendTitle')}</p>
        <p className="mt-1 mb-3 text-xs text-gray-500">{t('cr_sendHint')}</p>
        {sendableJobs.length === 0 ? (
          <p className="rounded-xl border border-gray-800 bg-gray-950/50 p-3 text-xs text-gray-500">{t('cr_noHeldCars')}</p>
        ) : (
          <div data-cross-return-held-cars className="space-y-3">
            {sendableJobs.map(x => {
              const homeStatus = homeReturnStatusOf(x);
              const canStartStaff = x.role === 'receiving' && x.status === 'received' && homeStatus === 'staff_requested';
              const canPublishOneWay = x.role === 'receiving' && x.status === 'received' && homeStatus === 'one_way_requested';
              const inspectionAction = bestGoInspectionAction(x);
              const alreadyMoving = ['staff_returning', 'one_way_listed', 'one_way_booked', 'one_way_returning'].includes(homeStatus);
              return (
                <div key={x.id} className="rounded-2xl border border-gray-800 bg-gray-950/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{x.vehicleLabel || x.vehicleId}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{t('cr_opsHolding')} · {x.counterpartName}</p>
                      {x.receivingLocation && <p className="mt-0.5 truncate text-xs text-gray-500">📍 {x.receivingLocation}</p>}
                    </div>
                    <span className={`flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${statusColor(x.status)}`}>{t(`cr_st_${x.status}`)}</span>
                  </div>

                  <BestGoJobTimeline job={x} t={t} accent={g} />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {inspectionAction && (
                      <button onClick={() => openInspection(x)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-800">
                        📸 {t(inspectionAction.buttonKey)}
                      </button>
                    )}
                    {x.sharePhotos && (
                      <button onClick={() => setViewer(x.sharedPhotos)} className="rounded-lg border border-purple-700 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-900/30">
                        🖼 {t('cr_viewPhotos')}
                      </button>
                    )}
                    {canStartStaff && (
                      <button onClick={() => startStaffReturn(x.id)} className="rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-900/30">{t('cr_homeReturnStaff')}</button>
                    )}
                    {canPublishOneWay && (
                      <button onClick={() => publishHomeReturnOneWay(x.id)} className="rounded-lg border border-fuchsia-700 px-3 py-1.5 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-900/30">{t('cr_homeReturnOneWay')}</button>
                    )}
                  </div>

                  {!canStartStaff && !canPublishOneWay && (
                    <p className="mt-2 rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs text-gray-400">
                      {alreadyMoving ? t('cr_sendAlreadyMoving') : t('cr_sendWaitingRequest')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ── Best Anywhere 運用ボード ────────────────────── */}
      {showOpsSection && (
      <>
      <div data-best-go-section="ops" className="scroll-mt-24">
        <p className="mb-2 text-sm font-bold text-white">{t('cr_opsTitle')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            [t('cr_opsIncoming'), grouped.incomingScheduled.length],
            [t('cr_opsAwayHolding'), grouped.awaitingReturnRequest.length],
            [t('cr_opsHolding'), grouped.holdingOtherVehicles.length],
            [t('cr_opsReturnRequests'), grouped.returnRequests.length],
            [t('cr_opsStaffReturning'), grouped.staffReturning.length],
            [t('cr_opsOneWayReturning'), grouped.oneWayReturning.length],
            [t('cr_opsReturnedHome'), grouped.returnedHome.length],
            [t('cr_opsSettlement'), grouped.settlement.length],
          ].map(([label, count]) => (
            <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2">
              <p className="truncate text-[11px] font-semibold text-gray-400">{label}</p>
              <p className="mt-1 text-xl font-black text-white">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {operationSections.map(sec => (
        <div key={sec.key}>
          <p className="mb-2 text-sm font-semibold text-white">{sec.title} ({sec.items.length})</p>
          {sec.items.length === 0 ? (
            <p className="text-xs text-gray-500">{t('cr_empty')}</p>
          ) : (
            <div className="space-y-3">
              {sec.items.map(x => {
                const homeStatus = homeReturnStatusOf(x);
                const canRequestReturn = x.role === 'origin' && x.status === 'received' && ['holding', 'undecided', 'staff_requested', 'one_way_requested'].includes(homeStatus);
                const canStartStaff = x.role === 'receiving' && x.status === 'received' && homeStatus === 'staff_requested';
                const canPublishOneWay = x.role === 'receiving' && x.status === 'received' && homeStatus === 'one_way_requested';
                const canMarkHome = x.role === 'origin' && ['staff_returning', 'one_way_booked', 'one_way_returning'].includes(homeStatus);
                const inspectionAction = bestGoInspectionAction(x);
                return (
                <div key={x.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{x.vehicleLabel || x.vehicleId}</p>
                      <p className="text-xs text-gray-500">{x.reservationId} · {x.counterpartName}</p>
                      {x.receivingLocation && <p className="text-xs text-gray-500">📍 {x.receivingLocation}</p>}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusColor(x.status)}`}>{t(`cr_st_${x.status}`)}</span>
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-300">{t(`cr_home_${homeStatus}`)}</span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between rounded-xl bg-gray-800/50 px-3 py-2">
                    <span className="text-xs text-gray-400">
                      {x.baseFee > 0 ? `${t('cr_baseFee')} ${yen(x.baseFee)} + ` : ''}
                      {x.feeMode === 'storage'
                        ? `${t('cr_storage')} ${yen(x.storagePerDay)}/${t('cr_perDay')} × ${x.daysStored}${t('cr_days')}`
                        : `${t('cr_split')} ${x.splitType === 'fixed' ? yen(x.splitValue) : `${x.splitValue}%`}`}
                    </span>
                    <span className="text-lg font-black" style={{ color: g }}>{yen(x.feeTotal)}</span>
                  </div>

                  <BestGoJobTimeline job={x} t={t} accent={g} />

                  {/* 受け入れ側：保管日数の入力＋ステータス操作 */}
                  {x.role === 'receiving' && x.feeMode === 'storage' && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-gray-400">{t('cr_days')}</label>
                      <input type="number" min="0" defaultValue={x.daysStored}
                        onBlur={e => patchArrangement(x.id, { daysStored: e.target.value })}
                        className="w-20 rounded-lg border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-white" />
                      <span className="text-[10px] text-gray-500">{t('cr_daysHint')}</span>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {inspectionAction && (
                      <button onClick={() => openInspection(x)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-800">
                        📸 {t(inspectionAction.buttonKey)}
                      </button>
                    )}
                    {x.sharePhotos && (
                      <button onClick={() => setViewer(x.sharedPhotos)} className="rounded-lg border border-purple-700 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-900/30">
                        🖼 {t('cr_viewPhotos')}
                      </button>
                    )}
                    {x.status !== 'settled' && x.status !== 'cancelled' && (
                      <>
                        {x.role === 'receiving' && x.status === 'requested' && (
                          <button onClick={() => patchArrangement(x.id, { status: 'accepted' })} className="rounded-lg border border-blue-700 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-900/30">{t('cr_accept')}</button>
                        )}
                        {x.role === 'receiving' && (x.status === 'accepted' || x.status === 'requested') && (
                          <button onClick={() => patchArrangement(x.id, { status: 'received' })} className="rounded-lg border border-purple-700 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-900/30">{t('cr_markReceived')}</button>
                        )}
                        {canRequestReturn && (
                          <button onClick={() => requestStaffReturn(x.id)} className="rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-900/30">{t('cr_homeReturnStaffRequest')}</button>
                        )}
                        {canRequestReturn && (
                          <button onClick={() => requestHomeReturnOneWay(x.id)} className="rounded-lg border border-fuchsia-700 px-3 py-1.5 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-900/30">{t('cr_homeReturnOneWayRequest')}</button>
                        )}
                        {canStartStaff && (
                          <button onClick={() => startStaffReturn(x.id)} className="rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-900/30">{t('cr_homeReturnStaff')}</button>
                        )}
                        {canPublishOneWay && (
                          <button onClick={() => publishHomeReturnOneWay(x.id)} className="rounded-lg border border-fuchsia-700 px-3 py-1.5 text-xs font-semibold text-fuchsia-300 hover:bg-fuchsia-900/30">{t('cr_homeReturnOneWay')}</button>
                        )}
                        {canMarkHome && (
                          <button aria-label={t('cr_markReturnedHome')} onClick={() => markReturnedHome(x.id)} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/30">{t('cr_confirmNormalPublic')}</button>
                        )}
                        <button onClick={() => patchArrangement(x.id, { status: 'settled' })} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/30">{t('cr_settle')}</button>
                        <button onClick={() => patchArrangement(x.id, { status: 'cancelled' })} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-white">{t('cr_cancel')}</button>
                      </>
                    )}
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      ))}
      </>
      )}

      {viewer && <SharedPhotos data={viewer} t={t} onClose={() => setViewer(null)} />}
      {inspectionTarget && (
        <DamageInspection
          reservation={inspectionTarget}
          initialPhase={inspectionTarget.inspectionPhase}
          labels={inspectionTarget.inspectionLabels}
          onClose={() => { setInspectionTarget(null); load(); }}
        />
      )}
      {mapVehicle && (
        <CrossReturnDestMap
          vehicleName={`${mapVehicle.maker ?? ''} ${mapVehicle.model ?? ''}`.trim()}
          receivers={receivers}
          selectedIds={vehDests[String(mapVehicle.id)] ?? []}
          onToggle={(recvId) => toggleVehDest(mapVehicle.id, recvId)}
          onClose={() => { saveVehDests(mapVehicle.id); setMapVehicle(null); }}
          t={t}
        />
      )}
    </div>
  );
}
