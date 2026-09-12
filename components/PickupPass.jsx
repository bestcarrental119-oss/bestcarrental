'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18nContext';
import { haptic, beep } from '../lib/native';

// Load the QR generator (node-qrcode UMD) from CDN. Hardened so it can never
// hang the pass forever: polls for window.QRCode (covers the "script already
// loaded" case), tries a backup CDN on error, and rejects after a timeout.
const QR_CDNS = [
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js',
];
// Plain <img> QR fallback — works even if the JS library is blocked. The token
// is an opaque random code (no personal data), so this is safe to render.
function qrImageFallback(token) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=560x560&margin=8&data=${encodeURIComponent(token)}`;
}
function loadQrLib() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.QRCode?.toDataURL) return Promise.resolve(window.QRCode);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; clearInterval(poll); clearTimeout(timer); fn(arg); } };
    // Poll in case a previous <script> already finished loading (its onload
    // event won't fire again for us).
    const poll = setInterval(() => { if (window.QRCode?.toDataURL) finish(resolve, window.QRCode); }, 150);
    const timer = setTimeout(() => finish(reject, new Error('qr lib timeout')), 8000);
    let idx = 0;
    const tryNext = () => {
      if (window.QRCode?.toDataURL) return finish(resolve, window.QRCode);
      if (idx >= QR_CDNS.length) return; // let the timeout reject
      const s = document.createElement('script');
      s.src = QR_CDNS[idx++];
      s.async = true;
      s.onload = () => { if (window.QRCode?.toDataURL) finish(resolve, window.QRCode); };
      s.onerror = tryNext;
      document.head.appendChild(s);
    };
    tryNext();
  });
}

// Build the IDP / licence / passport snapshot from the signed-in user's profile.
function buildSnapshot(currentUser) {
  const profile = currentUser?.bookingProfile ?? {};
  return {
    name: currentUser?.name ?? profile.name ?? '',
    nat: currentUser?.nat ?? profile.nat ?? '',
    email: currentUser?.email ?? '',
    phone: currentUser?.phone ?? profile.phone ?? '',
    documents: profile.documents ?? {},
  };
}

export default function PickupPass({ reservation, currentUser, onClose }) {
  const { t } = useI18n();
  const [token, setToken] = useState(reservation?.pickupToken ?? null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [verified, setVerified] = useState(Boolean(reservation?.pickupVerifiedAt));
  const pollRef = useRef(null);

  const snapshot = buildSnapshot(currentUser);
  const hasIdp = Boolean(snapshot.documents?.idp?.dataUrl || snapshot.documents?.idp?.expiry);

  // Create / refresh the pass, then render the QR from the returned token.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr('');
      // Don't let a slow/unresponsive request hang the pass on "生成中" forever.
      const ctrl = new AbortController();
      const fetchTimer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch('/api/pickup-pass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservationId: reservation.id, userId: currentUser?.id, snapshot }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create pass');
        if (!alive) return;
        // Show the pass immediately with the token — the QR image is rendered
        // separately below and must never block this.
        setToken(data.token);
        setLoading(false);
        // Render the QR without blocking the pass. If the JS library fails to
        // load, fall back to a plain <img> QR service so a code always shows.
        try {
          const lib = await loadQrLib();
          const url = await lib.toDataURL(data.token, { width: 560, margin: 1, errorCorrectionLevel: 'M' });
          if (alive) setQr(url);
        } catch {
          if (alive) setQr(qrImageFallback(data.token));
        }
      } catch (e) {
        if (alive) {
          setErr(e.name === 'AbortError' ? (t('pp_timeout') || 'Timed out. Please try again.') : (e.message || 'Error'));
          setLoading(false);
        }
      } finally {
        clearTimeout(fetchTimer);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation?.id]);

  // Poll so the renter sees "✓ Verified" the moment the owner scans it.
  useEffect(() => {
    if (!token || verified) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/pickup-pass?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.verified) {
          setVerified(true);
          clearInterval(pollRef.current);
          haptic('success'); beep('success'); // confirm handoff to the customer
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [token, verified]);

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-white safe-top">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-purple-600">{t('pp_title')}</p>
          <p className="text-xs text-gray-400">{reservation.id}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 active:scale-90"
          aria-label="Close"
        >×</button>
      </div>

      {/* Body — big centered QR that fills the screen */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {loading && <div className="text-gray-400">{t('pp_generating')}</div>}
        {err && !loading && <div className="text-center text-sm text-red-500">{err}</div>}

        {!loading && !err && (verified ? (
          <div className="flex w-full max-w-sm flex-col items-center rounded-3xl border-2 border-emerald-300 bg-emerald-50 py-16">
            <div className="text-7xl">✅</div>
            <p className="mt-4 text-xl font-extrabold text-emerald-700">{t('pp_verified')}</p>
          </div>
        ) : (
          <>
            <div className="w-full max-w-xs rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl">
              {qr
                ? <img src={qr} alt="Pickup QR" className="mx-auto aspect-square w-full max-w-[300px]" />
                : <div className="mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center text-xs text-gray-400">{t('pp_generating')}</div>}
            </div>
            <p className="mt-5 select-all font-mono text-2xl font-black tracking-[0.2em] text-gray-900">{token}</p>
            {!hasIdp && (
              <p className="mt-4 max-w-xs rounded-xl bg-amber-50 px-4 py-2 text-center text-xs text-amber-700">{t('pp_noIdpHint')}</p>
            )}
          </>
        ))}
      </div>

      {/* Bottom instruction */}
      {!loading && !err && !verified && (
        <div className="px-6 pb-app-nav pt-2">
          <p className="mx-auto max-w-sm text-center text-sm leading-relaxed text-gray-500">{t('pp_instructions')}</p>
        </div>
      )}
    </div>
  );
}
