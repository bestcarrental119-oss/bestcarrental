'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18nContext';
import { haptic, beep, capturePhoto, downscaleImage, getCurrentPosition } from '../lib/native';
import DamageInspection from './DamageInspection';

// Robust CDN script loader: polls for the global (covers the "already loaded"
// case whose load event won't fire again), tries a backup CDN on error, and
// rejects after a timeout so the caller never hangs silently.
function loadCdnGlobal(globalKey, urls, timeoutMs = 8000) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window[globalKey]) return Promise.resolve(window[globalKey]);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; clearInterval(poll); clearTimeout(timer); fn(arg); } };
    const poll = setInterval(() => { if (window[globalKey]) finish(resolve, window[globalKey]); }, 150);
    const timer = setTimeout(() => finish(reject, new Error(`${globalKey} load timeout`)), timeoutMs);
    let idx = 0;
    const tryNext = () => {
      if (window[globalKey]) return finish(resolve, window[globalKey]);
      if (idx >= urls.length) return; // let the timeout reject
      const s = document.createElement('script');
      s.src = urls[idx++];
      s.async = true;
      s.onload = () => { if (window[globalKey]) finish(resolve, window[globalKey]); };
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  });
}

// html5-qrcode UMD (global: Html5Qrcode). Camera scanning + image-file scanning;
// manual code entry always works as a final fallback.
function loadScannerLib() {
  return loadCdnGlobal('Html5Qrcode', [
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  ]);
}

const DOC_LABELS = { license: "Driver's Licence", idp: 'IDP', passport: 'Passport' };

function isPickupStarted(record) {
  const info = record?.reservation_info ?? {};
  return Boolean(
    record?.pickup_verified_at
    || info.pickupVerifiedAt
    || String(info.status ?? '').toLowerCase() === 'in_progress'
  );
}

function isReturnCompleted(record) {
  const status = String(record?.reservation_info?.status ?? '').toLowerCase();
  return status === 'waiting_review' || status === 'completed';
}

// JSZip UMD (global: JSZip) for the record export.
function loadZipLib() {
  return loadCdnGlobal('JSZip', [
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
  ]);
}

export default function OwnerPickupScanner({ ownerId, theme }) {
  const { t } = useI18n();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [startingPickup, setStartingPickup] = useState(null);
  const [completingReturn, setCompletingReturn] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [inspectRec, setInspectRec] = useState(null); // AI点検（10箇所）モーダル対象
  const scannerRef = useRef(null);
  const fileRef = useRef(null);

  // Days until a record auto-deletes (purge_after). Drives the in-app reminder.
  const daysUntilPurge = (r) => r.purge_after ? Math.ceil((new Date(r.purge_after) - Date.now()) / 86400000) : null;
  const expiringCount = records.filter(r => { const d = daysUntilPurge(r); return d != null && d <= 7; }).length;

  const load = async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/pickup-records?ownerId=${ownerId}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ownerId]);

  // Redeem a scanned / typed token → saves to the owner's account.
  const redeem = async (token) => {
    const code = String(token || '').trim().toUpperCase();
    if (!code) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch('/api/owner/pickup-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId, token: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      if (data.requiresInspection) {
        setMsg(t('ps_inspectionRequired'));
        setInspectRec(data.record ?? null);
      } else if (data.pickupVerified) {
        setMsg(t('ps_pickupCompleted'));
      } else {
        setMsg(t('ps_readyToStart'));
      }
      setManual('');
      haptic('success'); beep('success'); // scan confirmed
      await load();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErr(e.message);
      haptic('error'); beep('error');
    } finally { setBusy(false); }
  };

  const completePickupIfReady = async (record) => {
    if (!record?.id) return false;
    setErr('');
    setStartingPickup(record.id);
    try {
      const res = await fetch('/api/owner/pickup-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, ownerId, action: 'complete-pickup' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.pickupVerified) {
        setMsg(t('ps_pickupCompleted'));
        haptic('success'); beep('success');
        await load();
        setTimeout(() => setMsg(''), 3000);
        return true;
      }
      if (data.code === 'departure_inspection_required') {
        setMsg(t('ps_inspectionRequired'));
        return false;
      }
      if (data.code === 'pickup_payment_not_ready') {
        setMsg(t('ps_paymentNotReady'));
        return false;
      }
      throw new Error(data.error || 'Pickup completion failed');
    } catch (e) {
      setErr(e.message);
      haptic('error'); beep('error');
      return false;
    } finally {
      setStartingPickup(null);
    }
  };

  const completeReturnIfReady = async (record) => {
    if (!record?.id) return false;
    setErr('');
    setCompletingReturn(record.id);
    try {
      const res = await fetch('/api/owner/pickup-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, ownerId, action: 'complete-return' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.returnCompleted) {
        setMsg(t('ps_returnCompleted'));
        haptic('success'); beep('success');
        await load();
        setTimeout(() => setMsg(''), 3000);
        return true;
      }
      if (data.code === 'return_inspection_required') {
        setMsg(t('ps_returnInspectionRequired'));
        return false;
      }
      if (data.code === 'return_not_in_progress') {
        setMsg(t('ps_returnNotStarted'));
        return false;
      }
      throw new Error(data.error || 'Return completion failed');
    } catch (e) {
      setErr(e.message);
      haptic('error'); beep('error');
      return false;
    } finally {
      setCompletingReturn(null);
    }
  };

  const startCamera = async () => {
    setErr('');
    try {
      const Html5Qrcode = await loadScannerLib();
      setScanning(true);
      // Wait a tick so the target div is mounted.
      setTimeout(async () => {
        try {
          const scanner = new Html5Qrcode('pickup-scanner-view');
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: 220 },
            async (decoded) => { await stopCamera(); redeem(decoded); },
            () => {},
          );
        } catch (e) { setErr(t('ps_cameraErr')); setScanning(false); }
      }, 50);
    } catch { setErr(t('ps_cameraErr')); setScanning(false); }
  };

  // Read a QR from a still image (screenshot / photo) — works without a camera.
  const scanFromFile = async (file) => {
    if (!file) return;
    setErr(''); setMsg(''); setBusy(true);
    try {
      const Html5Qrcode = await loadScannerLib();
      const scanner = new Html5Qrcode('pickup-scanner-file');
      const decoded = await scanner.scanFile(file, false);
      try { await scanner.clear(); } catch { /* ignore */ }
      await redeem(decoded);
    } catch {
      setErr(t('ps_fileErr'));
      haptic('error'); beep('error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const stopCamera = async () => {
    try { await scannerRef.current?.stop(); scannerRef.current?.clear(); } catch { /* ignore */ }
    scannerRef.current = null;
    setScanning(false);
  };
  useEffect(() => () => { stopCamera(); }, []);

  const [capturing, setCapturing] = useState(null); // `${id}:${phase}` while capturing

  // Photograph the vehicle at pickup/return, tag with GPS + time, save to record.
  const capture = async (record, phase) => {
    setErr('');
    setCapturing(`${record.id}:${phase}`);
    try {
      const raw = await capturePhoto();
      if (!raw) return; // cancelled
      const dataUrl = await downscaleImage(raw, 1280, 0.6);
      const pos = await getCurrentPosition().catch(() => null);
      const res = await fetch('/api/owner/pickup-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id, ownerId,
          photo: { phase, dataUrl, lat: pos?.lat ?? null, lng: pos?.lng ?? null, at: new Date().toISOString() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      haptic('success'); beep('success');
      setMsg(t('ps_photoSaved'));
      await load();
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setErr(e.message); haptic('error');
    } finally {
      setCapturing(null);
    }
  };

  const removeRecord = async (id) => {
    if (!confirm(t('ps_confirmDelete'))) return;
    await fetch(`/api/owner/pickup-records?id=${id}&ownerId=${ownerId}`, { method: 'DELETE' });
    load();
  };

  // ── Exports ────────────────────────────────────────────────────────
  const exportCsv = () => {
    const head = ['Reservation', 'Renter', 'Nationality', 'Pickup', 'Return', 'IDP expiry', 'Licence expiry', 'Scanned at'];
    const rows = records.map(r => {
      const d = r.documents ?? {}; const info = r.reservation_info ?? {};
      return [r.reservation_id, r.renter_name ?? '', r.nat ?? '', info.pickupAt ?? '', info.returnAt ?? '',
        d.idp?.expiry ?? '', d.license?.expiry ?? '', r.scanned_at ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [head.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `pickup-records-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const [zipping, setZipping] = useState(false);
  // Download EVERYTHING (IDP + handover photos + a manifest) as one ZIP, so the
  // owner can keep records before they auto-delete.
  const exportZip = async () => {
    if (records.length === 0) return;
    setZipping(true); setErr('');
    try {
      const JSZip = await loadZipLib();
      const zip = new JSZip();
      const manifest = [['Reservation', 'Renter', 'Nationality', 'Pickup', 'Return', 'File', 'Type', 'When', 'GPS']];
      for (const r of records) {
        const folder = zip.folder(String(r.reservation_id || r.id).replace(/[^\w.-]/g, '_'));
        const info = r.reservation_info ?? {};
        const add = async (url, name, type, when, gps) => {
          if (!url) return;
          try {
            const blob = await fetch(url).then(x => x.blob());
            folder.file(name, blob);
            manifest.push([r.reservation_id, r.renter_name ?? '', r.nat ?? '', info.pickupAt ?? '', info.returnAt ?? '', name, type, when ?? '', gps ?? '']);
          } catch { /* skip unreachable file */ }
        };
        for (const [k, v] of Object.entries(r.documents ?? {})) {
          const src = v?.url || v?.dataUrl;
          if (src) await add(src, `${k}.jpg`, 'document', '', '');
        }
        let i = 0;
        for (const p of (Array.isArray(r.photos) ? r.photos : [])) {
          const src = p?.url || p?.dataUrl;
          if (src) await add(src, `${p.phase}-${i++}.jpg`, 'photo', p.at ?? '', p.lat ? `${p.lat},${p.lng}` : '');
        }
      }
      const csv = manifest.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      zip.file('manifest.csv', csv);
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url; a.download = `pickup-records-${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || 'Export failed');
    } finally {
      setZipping(false);
    }
  };

  const printRecord = (r) => {
    const d = r.documents ?? {}; const info = r.reservation_info ?? {};
    const imgs = Object.entries(d)
      .filter(([, v]) => v?.url || v?.dataUrl)
      .map(([k, v]) => `<div style="margin:10px 0"><b>${DOC_LABELS[k] ?? k}</b>${v.expiry ? ` — expiry ${v.expiry}` : ''}<br><img src="${v.url || v.dataUrl}" style="max-width:100%;max-height:340px;border:1px solid #ccc;border-radius:8px"></div>`)
      .join('');
    const photos = (Array.isArray(r.photos) ? r.photos : [])
      .map(p => `<div style="margin:10px 0"><b>${p.phase === 'return' ? 'Return' : 'Pickup'} photo</b> — ${p.at ? new Date(p.at).toLocaleString() : ''}${p.lat ? ` · GPS ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ''}<br><img src="${p.url || p.dataUrl || ''}" style="max-width:100%;max-height:340px;border:1px solid #ccc;border-radius:8px"></div>`)
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Pickup Record ${r.reservation_id}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{border-collapse:collapse;margin:12px 0}td{padding:4px 12px 4px 0;font-size:14px}</style>
      </head><body>
      <h1>🚗 Pickup Record — ${r.reservation_id}</h1>
      <table>
        <tr><td><b>Renter</b></td><td>${r.renter_name ?? ''}</td></tr>
        <tr><td><b>Nationality</b></td><td>${r.nat ?? ''}</td></tr>
        <tr><td><b>Pickup</b></td><td>${info.pickupAt ?? ''}</td></tr>
        <tr><td><b>Return</b></td><td>${info.returnAt ?? ''}</td></tr>
        <tr><td><b>Scanned</b></td><td>${r.scanned_at ?? ''}</td></tr>
      </table>
      ${imgs || '<p style="color:#888">No document images.</p>'}
      ${photos ? '<h2 style="font-size:15px;margin-top:16px">Handover photos</h2>' + photos : ''}
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white text-lg font-bold">🪪 {t('ps_title')}</h2>
        <p className="text-gray-400 text-sm mt-1">{t('ps_desc')}</p>
      </div>

      {/* Full-screen scanner overlay */}
      {scanning && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black safe-top">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <p className="text-sm font-bold text-white">📷 {t('ps_scan')}</p>
            <button onClick={stopCamera} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-white active:scale-90" aria-label="Close">×</button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="relative w-full max-w-sm">
              <div id="pickup-scanner-view" className="aspect-square w-full overflow-hidden rounded-3xl" />
              {/* Framing guide */}
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-4 border-white/70" />
            </div>
          </div>
          <div className="px-6 pb-app-nav pt-3">
            <p className="mb-3 text-center text-sm text-white/70">{t('ps_desc')}</p>
            <button onClick={stopCamera} className="w-full rounded-2xl bg-white/15 py-4 text-base font-bold text-white active:scale-95">
              {t('ps_stop')}
            </button>
          </div>
        </div>
      )}

      {/* Big scan button + manual entry */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <button
          onClick={startCamera}
          className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-lg font-extrabold text-white shadow-lg active:scale-95"
          style={{ background: `linear-gradient(90deg, ${theme?.primary ?? '#7c3aed'}, ${theme?.accent ?? '#a855f7'})` }}
        >
          <span className="text-2xl">📷</span> {t('ps_scan')}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 py-3 text-sm font-semibold text-gray-200 active:scale-95 disabled:opacity-50"
        >
          <span className="text-lg">🖼</span> {t('ps_fileScan')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => scanFromFile(e.target.files?.[0])}
        />
        {/* Hidden container required by html5-qrcode's scanFile */}
        <div id="pickup-scanner-file" className="hidden" />
        <div className="mt-3 flex gap-2">
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') redeem(manual); }}
            placeholder={t('ps_manualPlaceholder')}
            className="flex-1 rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm uppercase tracking-wider text-white focus:border-purple-500 focus:outline-none"
          />
          <button onClick={() => redeem(manual)} disabled={busy}
            className="rounded-xl border border-gray-700 px-5 py-3 text-sm font-semibold text-gray-200 active:scale-95 disabled:opacity-50">
            {busy ? '…' : t('ps_add')}
          </button>
        </div>
        {msg && <p className="mt-3 text-sm font-semibold text-emerald-400">✓ {msg}</p>}
        {err && <p className="mt-3 text-sm text-red-400">❌ {err}</p>}
      </div>

      {/* In-app reminder: records auto-deleting within 7 days (no email needed) */}
      {expiringCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-600/50 bg-amber-900/20 p-3">
          <span className="text-xl">⏳</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-200">{t('ps_expiringBanner').replace('{n}', expiringCount)}</p>
          </div>
          <button onClick={exportZip} disabled={zipping} className="flex-shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50">
            {zipping ? '…' : `⬇ ${t('ps_exportZip')}`}
          </button>
        </div>
      )}

      {/* Saved records */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{t('ps_saved_list')} ({records.length})</p>
        {records.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportZip} disabled={zipping} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-50">
              {zipping ? '…' : `⬇ ${t('ps_exportZip')}`}
            </button>
            <button onClick={exportCsv} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white active:scale-95">
              ⬇ {t('ps_csv')}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">…</p>
      ) : records.length === 0 ? (
        <p className="text-gray-500 text-sm">{t('ps_empty')}</p>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const d = r.documents ?? {}; const info = r.reservation_info ?? {};
            const pickupStarted = isPickupStarted(r);
            const returnCompleted = isReturnCompleted(r);
            return (
              <div key={r.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{r.renter_name || '—'} <span className="text-xs text-gray-500">{r.nat}</span></p>
                    <p className="text-xs text-gray-500">{r.reservation_id} · {info.pickupAt?.slice(0, 16).replace('T', ' ')} → {info.returnAt?.slice(0, 16).replace('T', ' ')}</p>
                    {(() => { const dl = daysUntilPurge(r); return dl != null && dl <= 7 ? (
                      <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${dl <= 2 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        ⏳ {t('ps_expiresIn').replace('{d}', Math.max(0, dl))}
                      </span>
                    ) : null; })()}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button onClick={() => printRecord(r)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white">🖨 {t('ps_print')}</button>
                    <button onClick={() => removeRecord(r.id)} className="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:text-red-300">🗑</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {Object.entries(d).filter(([, v]) => v?.url || v?.dataUrl || v?.path || v?.expiry).map(([k, v]) => {
                    const src = v.url || v.dataUrl;
                    return (
                    <div key={k} className="rounded-xl border border-gray-800 bg-gray-950 p-2 text-center">
                      <p className="mb-1 text-[11px] font-semibold text-gray-300">{DOC_LABELS[k] ?? k}</p>
                      {src
                        ? <img src={src} alt={k} className="h-24 w-32 rounded object-cover" />
                        : <div className="flex h-24 w-32 items-center justify-center text-gray-600 text-xs">no image</div>}
                      {v.expiry && <p className="mt-1 text-[10px] text-gray-500">exp {v.expiry}</p>}
                      {src && (
                        <a href={src} target="_blank" rel="noreferrer" download={`${r.reservation_id}-${k}`} className="mt-1 block text-[11px] text-purple-300 hover:text-purple-200">⬇ {t('ps_image')}</a>
                      )}
                    </div>
                    );
                  })}
                </div>

                {/* Handover photos (GPS + timestamp) */}
                <div className="mt-4 border-t border-gray-800 pt-3">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => completePickupIfReady(r)}
                      disabled={startingPickup === r.id || pickupStarted}
                      className={`rounded-xl px-4 py-2.5 text-xs font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
                        pickupStarted
                          ? 'border border-emerald-600/50 bg-emerald-900/30 text-emerald-200'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {startingPickup === r.id ? t('bk_processing') : pickupStarted ? t('ps_pickupAlreadyStarted') : t('ps_startPickup')}
                    </button>
                    <button onClick={() => capture(r, 'pickup')} disabled={capturing}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50">
                      📷 {capturing === `${r.id}:pickup` ? t('ps_capturing') : t('ps_pickupPhoto')}
                    </button>
                    <button onClick={() => capture(r, 'return')} disabled={capturing}
                      className="rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50">
                      📷 {capturing === `${r.id}:return` ? t('ps_capturing') : t('ps_returnPhoto')}
                    </button>
                    <button
                      onClick={() => completeReturnIfReady(r)}
                      disabled={completingReturn === r.id || !pickupStarted || returnCompleted}
                      className={`rounded-xl px-4 py-2.5 text-xs font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
                        returnCompleted
                          ? 'border border-sky-600/50 bg-sky-900/30 text-sky-200'
                          : 'bg-sky-600 text-white'
                      }`}
                    >
                      {completingReturn === r.id ? t('bk_processing') : returnCompleted ? t('ps_returnAlreadyCompleted') : t('ps_completeReturn')}
                    </button>
                    <button onClick={() => setInspectRec(r)}
                      className="rounded-xl border border-purple-500 bg-purple-600/20 px-4 py-2.5 text-xs font-bold text-purple-200 active:scale-95">
                      🤖 {t('di_openInspection')}
                    </button>
                  </div>
                  {Array.isArray(r.photos) && r.photos.length > 0 && (
                    <>
                      <p className="mb-1 text-[11px] font-semibold text-gray-400">🖼 {t('ps_photos')}</p>
                      <div className="flex flex-wrap gap-2">
                        {r.photos.map((p, i) => (
                          <a key={i} href={p.url || p.dataUrl} target="_blank" rel="noreferrer" download={`${r.reservation_id}-${p.phase}-${i}`}
                             className="relative block overflow-hidden rounded-lg border border-gray-800">
                            <img src={p.url || p.dataUrl} alt={p.phase} className="h-24 w-32 object-cover" />
                            <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${p.phase === 'return' ? 'bg-sky-600' : 'bg-emerald-600'}`}>
                              {p.phase === 'return' ? t('ps_returnPhoto') : t('ps_pickupPhoto')}
                            </span>
                            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[8px] text-white">
                              {p.at ? new Date(p.at).toLocaleString() : ''}{p.lat ? ` · ${p.lat.toFixed(3)},${p.lng.toFixed(3)}` : ''}
                            </span>
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI点検（10箇所ガイド＋出発前/返却比較） */}
      {inspectRec && (
        <DamageInspection
          reservation={{ id: inspectRec.reservation_id, ...inspectRec }}
          initialPhase="before"
          onClose={() => {
            setInspectRec(null);
            load();
          }}
        />
      )}
    </div>
  );
}
