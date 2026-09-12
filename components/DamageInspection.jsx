'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, GradBtn } from './Shared';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { DEPARTURE_INSPECTION_POSITIONS } from '../lib/inspectionPhotos';

// ── 10 撮影ポジション（車を1周＝外装6＋内装4）────────────────────────────────
const POSITIONS = DEPARTURE_INSPECTION_POSITIONS;
const EXTERIOR = new Set(['front_left', 'front', 'front_right', 'rear_right', 'rear', 'rear_left']);

// 外装アングルごとのカメラ位置（俯瞰図に重ねる）
const CAM = {
  front_left:  { cam: [24, 20], look: [43, 29] },
  front:       { cam: [50, 11], look: [50, 25] },
  front_right: { cam: [76, 20], look: [57, 29] },
  rear_right:  { cam: [76, 80], look: [57, 71] },
  rear:        { cam: [50, 89], look: [50, 75] },
  rear_left:   { cam: [24, 80], look: [43, 71] },
};

const yen = n => `¥${Number(n || 0).toLocaleString()}`;

function beforePhotoSignature(reservationId, photos) {
  const beforePhotos = POSITIONS.map(id => photos?.[id]?.before);
  if (!reservationId || beforePhotos.some(src => !src)) return '';
  return `${reservationId}:${beforePhotos.map(src => `${src.length}:${src.slice(0, 32)}:${src.slice(-32)}`).join('|')}`;
}

function afterPhotoSignature(reservationId, photos) {
  const afterPhotos = POSITIONS.map(id => photos?.[id]?.after);
  if (!reservationId || afterPhotos.some(src => !src)) return '';
  return `${reservationId}:${afterPhotos.map(src => `${src.length}:${src.slice(0, 32)}:${src.slice(-32)}`).join('|')}`;
}

// 画像を ~1024px / JPEG に縮小して dataURL 化
function fileToDataUrl(file, max = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// 俯瞰の車（前方が上）
function CarTopDown() {
  return (
    <g>
      <rect x="38" y="24" width="24" height="52" rx="9" fill="#374151" stroke="#6b7280" strokeWidth="1.4" />
      <path d="M41 34 L59 34 L56.5 42 L43.5 42 Z" fill="#93c5fd" opacity="0.55" />
      <path d="M43.5 61 L56.5 61 L59 68 L41 68 Z" fill="#93c5fd" opacity="0.4" />
      <rect x="33.5" y="31" width="4.5" height="9" rx="2" fill="#111827" />
      <rect x="62" y="31" width="4.5" height="9" rx="2" fill="#111827" />
      <rect x="33.5" y="60" width="4.5" height="9" rx="2" fill="#111827" />
      <rect x="62" y="60" width="4.5" height="9" rx="2" fill="#111827" />
    </g>
  );
}

// 内装ピクトグラム
function InteriorIcon({ id }) {
  const c = '#a855f7';
  if (id === 'windshield') return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path d="M22 66 L34 34 L66 34 L78 66 Z" fill="#93c5fd" opacity="0.5" stroke={c} strokeWidth="2.5" />
      <line x1="50" y1="34" x2="50" y2="66" stroke={c} strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
  if (id === 'meter') return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path d="M26 64 A24 24 0 0 1 74 64" fill="none" stroke={c} strokeWidth="3" />
      <line x1="50" y1="64" x2="63" y2="46" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="64" r="3.5" fill="#fff" />
      <text x="50" y="80" textAnchor="middle" fontSize="10" fill="#9ca3af">km</text>
    </svg>
  );
  // seats
  const two = id === 'rear_seats';
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {(two ? [34, 62] : [50]).map((x, i) => (
        <g key={i}>
          <rect x={x - 12} y="38" width="24" height="10" rx="4" fill={c} opacity="0.85" />
          <rect x={x - 12} y="46" width="8" height="22" rx="4" fill={c} opacity="0.85" />
        </g>
      ))}
    </svg>
  );
}

function GuideDiagram({ id }) {
  const ext = CAM[id];
  if (!ext) return <InteriorIcon id={id} />;
  const [cx, cy] = ext.cam;
  const [lx, ly] = ext.look;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <CarTopDown />
      <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="#a855f7" strokeWidth="1.6" strokeDasharray="3 2" />
      <circle cx={cx} cy={cy} r="7.5" fill="#a855f7" />
      <circle cx={cx} cy={cy} r="2.6" fill="#fff" />
    </svg>
  );
}

// 1枚撮影/アップロードボタン。capture 属性を付けないことで、OS が
// 「写真を撮る」「フォトライブラリ」「ファイルを選択」を選ばせてくれる
// （＝既存写真のアップロードでテスト可能）。
function CaptureButton({ children, onPick, className = '' }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className={className}>{children}</button>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={async e => { const f = e.target.files?.[0]; if (f) onPick(await fileToDataUrl(f)); e.target.value = ''; }} />
    </>
  );
}

export default function DamageInspection({ reservation, onClose, initialPhase = null, labels = null }) {
  const { state, dispatch } = useApp();
  const { theme } = state;
  const { t } = useI18n();
  const rid = reservation?.inspectionId ?? reservation?.id;
  const requestedPhase = initialPhase ?? reservation?.inspectionPhase ?? null;
  const inspectionLabels = labels ?? reservation?.inspectionLabels ?? {};

  const [phase, setPhase] = useState(requestedPhase ?? 'before'); // 'before' | 'after'
  const [photos, setPhotos] = useState({});      // { pos: { before, after } }
  const [selected, setSelected] = useState(() => new Set());
  const [analysis, setAnalysis] = useState(null);
  const [estCost, setEstCost] = useState(0);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [manual, setManual] = useState(false);
  const [manualDamage, setManualDamage] = useState('');
  const [manualCost, setManualCost] = useState('');
  const autoSavedBeforeCompleteRef = useRef('');
  const autoSavingBeforeCompleteRef = useRef(false);
  const autoSavedAfterCompleteRef = useRef('');
  const autoSavingAfterCompleteRef = useRef(false);

  useEffect(() => {
    if (!rid) return;
    setPhase(requestedPhase ?? 'before');
    fetch(`/api/inspection?reservationId=${encodeURIComponent(rid)}`)
      .then(r => r.json()).then(d => {
        const insp = d.inspection;
        if (insp) {
          const p = insp.photos ?? {};
          setPhotos(p);
          setAnalysis(insp.analysis ?? null);
          setEstCost(insp.est_cost ?? 0);
          if (insp.mode === 'manual') setManual(true);
          // before が揃っていれば返却フェーズを既定に
          const withBefore = POSITIONS.filter(id => p[id]?.before);
          if (withBefore.length >= POSITIONS.length) {
            autoSavedBeforeCompleteRef.current = beforePhotoSignature(rid, p);
            if (!requestedPhase) setPhase('after');
          }
          const withAfter = POSITIONS.filter(id => p[id]?.after);
          if (withAfter.length >= POSITIONS.length) {
            autoSavedAfterCompleteRef.current = afterPhotoSignature(rid, p);
          }
          setSelected(new Set(withBefore));
        }
      }).catch(() => {});
  }, [rid, requestedPhase]);

  const setPhoto = (pos, ph, dataUrl) =>
    setPhotos(p => ({ ...p, [pos]: { ...(p[pos] ?? {}), [ph]: dataUrl } }));

  const persist = useCallback(async (next) => {
    await fetch('/api/inspection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: rid, photos: next ?? photos }),
    });
  }, [photos, rid]);

  const savePhotos = async () => {
    setBusy(true);
    try { await persist(); dispatch({ type: 'TOAST', msg: t('sc_inspSaved') }); }
    finally { setBusy(false); }
  };

  const toggleSelect = (pos) => setSelected(s => {
    const n = new Set(s);
    n.has(pos) ? n.delete(pos) : n.add(pos);
    return n;
  });

  const beforeCount = POSITIONS.filter(id => photos[id]?.before).length;
  const afterCount = POSITIONS.filter(id => photos[id]?.after).length;
  const comparableIds = POSITIONS.filter(id => photos[id]?.before);

  useEffect(() => {
    if (!rid || beforeCount !== POSITIONS.length) return;
    const signature = beforePhotoSignature(rid, photos);
    if (!signature) return;
    if (autoSavedBeforeCompleteRef.current === signature || autoSavingBeforeCompleteRef.current) return;

    autoSavingBeforeCompleteRef.current = true;
    persist(photos)
      .then(() => {
        autoSavedBeforeCompleteRef.current = signature;
        dispatch({ type: 'TOAST', msg: t('sc_inspSaved') });
      })
      .catch(e => dispatch({ type: 'TOAST', msg: e.message || 'Inspection auto-save failed' }))
      .finally(() => { autoSavingBeforeCompleteRef.current = false; });
  }, [beforeCount, dispatch, photos, persist, rid, t]);

  useEffect(() => {
    if (!rid || afterCount !== POSITIONS.length) return;
    const signature = afterPhotoSignature(rid, photos);
    if (!signature) return;
    if (autoSavedAfterCompleteRef.current === signature || autoSavingAfterCompleteRef.current) return;

    autoSavingAfterCompleteRef.current = true;
    persist(photos)
      .then(() => {
        autoSavedAfterCompleteRef.current = signature;
        dispatch({ type: 'TOAST', msg: t('sc_inspSaved') });
      })
      .catch(e => dispatch({ type: 'TOAST', msg: e.message || 'Inspection auto-save failed' }))
      .finally(() => { autoSavingAfterCompleteRef.current = false; });
  }, [afterCount, dispatch, photos, persist, rid, t]);

  const analyze = async () => {
    const angles = [...selected].filter(id => photos[id]?.before && photos[id]?.after);
    if (angles.length === 0) { dispatch({ type: 'TOAST', msg: t('di_needSelect') }); return; }
    setAnalyzing(true);
    setManual(false);
    setAnalyzeError('');
    try {
      await persist();
      const res = await fetch('/api/inspection/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: rid, angles }),
      });
      const data = await res.json();
      if (data.manual) { setManual(true); return; }
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.analysis) throw new Error('AI returned no result');
      setAnalysis(data.analysis);
      setEstCost(data.estCost ?? 0);
    } catch (e) {
      setAnalyzeError(e.message || 'Analyze failed');
      dispatch({ type: 'TOAST', msg: e.message });
    } finally { setAnalyzing(false); }
  };

  const saveManual = async () => {
    const cost = Math.max(0, Math.round(Number(manualCost) || 0));
    const result = { items: manualDamage ? [{ angle: '-', type: 'other', location: manualDamage, severity: 'moderate', estimatedRepairJPY: cost }] : [], totalJPY: cost, newDamage: Boolean(manualDamage), summary: manualDamage || t('sc_inspNoDamage') };
    setBusy(true);
    try {
      await fetch('/api/inspection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: rid, analysis: result, estCost: cost, mode: 'manual' }),
      });
      setAnalysis(result); setEstCost(cost);
      dispatch({ type: 'TOAST', msg: t('sc_inspSaved') });
    } finally { setBusy(false); }
  };

  if (!reservation) return null;

  const PhaseTab = ({ id, label }) => (
    <button onClick={() => setPhase(id)}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
        phase === id ? 'text-white shadow' : 'bg-gray-800 text-gray-400'
      }`}
      style={phase === id ? { background: theme?.accent ?? '#a855f7' } : {}}>
      {label}
    </button>
  );

  return (
    <Modal open onClose={onClose} wide>
      <div className="p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white">📸 {inspectionLabels.title ?? t('sc_inspTitle')}</h3>
        <p className="mt-1 mb-3 text-xs text-gray-400">{inspectionLabels.hint ?? t('di_captureTip')}</p>

        {/* フェーズ切替 */}
        <div className="mb-4 flex gap-2 rounded-2xl bg-gray-900 p-1">
          <PhaseTab id="before" label={`🚗 ${inspectionLabels.beforeLabel ?? t('di_phaseBefore')}`} />
          <PhaseTab id="after" label={`🏁 ${inspectionLabels.afterLabel ?? t('di_phaseAfter')}`} />
        </div>

        {/* ── 出発前：10箇所ガイド撮影 ─────────────────────────── */}
        {phase === 'before' && (
          <>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{t('di_progress').replace('{done}', beforeCount)}</span>
                <span>{Math.round((beforeCount / POSITIONS.length) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${(beforeCount / POSITIONS.length) * 100}%`, background: theme?.accent ?? '#a855f7' }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {POSITIONS.map((pos, i) => {
                const shot = photos[pos]?.before;
                return (
                  <CaptureButton key={pos} onPick={d => setPhoto(pos, 'before', d)}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-800/40 text-left active:scale-[0.98]">
                    <div className="relative aspect-[4/3] w-full bg-gray-900">
                      {shot
                        ? <img src={shot} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full p-2">{<GuideDiagram id={pos} />}</div>}
                      <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">{i + 1}</span>
                      {shot
                        ? <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white">✓</span>
                        : <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] text-white">＋📷</span>}
                    </div>
                    <div className={`px-2 py-1.5 text-[11px] font-semibold ${shot ? 'text-emerald-300' : 'text-gray-200'}`}>
                      {t(`di_pos_${pos}`)}
                    </div>
                  </CaptureButton>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={savePhotos} disabled={busy}
                className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-200 disabled:opacity-50">
                💾 {t('sc_inspSave')}
              </button>
              <GradBtn theme={theme} onClick={() => setPhase('after')} className="flex-1 py-2.5 text-sm font-bold">
                {inspectionLabels.afterLabel ?? t('di_phaseAfter')} →
              </GradBtn>
            </div>
          </>
        )}

        {/* ── 返却時：比較箇所を選択 → AI比較 ────────────────────── */}
        {phase === 'after' && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{t('di_selectToCompare')}</p>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelected(new Set(comparableIds))} className="text-purple-300 hover:text-white">{t('di_selectAll')}</button>
                <span className="text-gray-600">·</span>
                <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:text-white">{t('di_clearAll')}</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {POSITIONS.map(pos => {
                const before = photos[pos]?.before;
                const after = photos[pos]?.after;
                const isSel = selected.has(pos);
                return (
                  <div key={pos} className={`rounded-2xl border p-2.5 transition-all ${
                    !before ? 'border-gray-800 bg-gray-900/40 opacity-60'
                      : isSel ? 'border-purple-500 bg-purple-900/15' : 'border-gray-700 bg-gray-800/30'
                  }`}>
                    <label className="mb-2 flex items-center gap-2">
                      <input type="checkbox" disabled={!before} checked={isSel} onChange={() => toggleSelect(pos)} className="h-4 w-4 accent-purple-500" />
                      <span className="text-sm font-semibold text-white">{t(`di_pos_${pos}`)}</span>
                      {!before && <span className="ml-auto text-[10px] text-amber-400">{t('di_beforeMissing')}</span>}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {/* before（撮影済み表示） */}
                      <div>
                        <p className="mb-1 text-[10px] text-gray-400">{inspectionLabels.beforeLabel ?? t('di_phaseBefore')}</p>
                        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
                          {before ? <img src={before} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full p-2"><GuideDiagram id={pos} /></div>}
                        </div>
                      </div>
                      {/* after（撮影） */}
                      <div>
                        <p className="mb-1 text-[10px] text-gray-400">{inspectionLabels.afterLabel ?? t('di_phaseAfter')}</p>
                        <CaptureButton onPick={d => setPhoto(pos, 'after', d)}
                          className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-gray-700 bg-gray-800/60 active:scale-[0.98]">
                          {after
                            ? <img src={after} alt="" className="h-full w-full object-cover" />
                            : <>
                                {before && <img src={before} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />}
                                <span className="text-2xl text-gray-500">＋📷</span>
                              </>}
                          {after && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">✓</span>}
                        </CaptureButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={savePhotos} disabled={busy}
                className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-200 disabled:opacity-50">
                💾 {t('sc_inspSave')}
              </button>
              <GradBtn theme={theme} onClick={analyze} disabled={analyzing} className="flex-1 py-2.5 text-sm font-bold">
                {analyzing ? t('sc_inspAnalyzing') : `🤖 ${t('di_compareSelected')} (${[...selected].filter(id => photos[id]?.before && photos[id]?.after).length})`}
              </GradBtn>
            </div>
            {analyzeError && (
              <p className="mt-2 rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">❌ {analyzeError}</p>
            )}
          </>
        )}

        {/* AI手動フォールバック */}
        {manual && (
          <div className="mt-4 rounded-xl border border-amber-700/40 bg-amber-900/15 p-3">
            <p className="text-xs font-semibold text-amber-200">⚠️ {t('sc_inspManualMode')}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input value={manualDamage} onChange={e => setManualDamage(e.target.value)} placeholder={t('sc_inspManualDamage')}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white sm:col-span-2" />
              <input type="number" value={manualCost} onChange={e => setManualCost(e.target.value)} placeholder={t('sc_inspManualCost')}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white" />
            </div>
            <button onClick={saveManual} disabled={busy} className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t('sc_inspSave')}</button>
          </div>
        )}

        {/* 解析結果 */}
        {analysis && (
          <div className="mt-4 rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <div className="flex items-center justify-between">
              <p className={`text-sm font-bold ${analysis.newDamage ? 'text-red-400' : 'text-emerald-400'}`}>
                {analysis.newDamage ? `⚠️ ${t('sc_inspDamageFound')}` : `✅ ${t('sc_inspNoDamage')}`}
              </p>
              <p className="text-right">
                <span className="block text-[10px] text-gray-400">{t('sc_inspEstCost')}</span>
                <span className="text-xl font-black" style={{ color: theme?.accent ?? '#a855f7' }}>{yen(estCost)}</span>
              </p>
            </div>
            {analysis.summary && <p className="mt-1 text-xs text-gray-300">{analysis.summary}</p>}
            {Array.isArray(analysis.items) && analysis.items.length > 0 && (
              <div className="mt-3 space-y-1">
                {analysis.items.map((it, i) => (
                  <div key={i} className="flex justify-between border-b border-gray-700/60 py-1 text-xs">
                    <span className="text-gray-300">{t(`di_pos_${it.angle}`) !== `di_pos_${it.angle}` ? t(`di_pos_${it.angle}`) : it.angle} · {it.type} · {it.location} <span className="text-gray-500">({it.severity})</span></span>
                    <span className="font-mono text-white">{yen(it.estimatedRepairJPY)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] text-gray-500">🔒 {t('sc_inspPresent')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
