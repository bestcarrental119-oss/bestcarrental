'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * SliderCaptcha — self-contained bot verification (no external service / API key).
 *
 * The user must drag the handle so it lands inside the randomly-placed target
 * zone. Combined with a honeypot field + minimum-interaction-time check this
 * blocks the vast majority of automated form submissions.
 *
 * Props:
 *   onVerify(ok: boolean)  — called when verification state changes
 *   label                  — instruction text
 */
export default function SliderCaptcha({ onVerify, label = 'Slide the handle into the highlighted zone' }) {
  const trackRef = useRef(null);
  const startTime = useRef(Date.now());
  const [target, setTarget]     = useState(() => 35 + Math.random() * 55); // 35–90%
  const [pos, setPos]           = useState(0);   // 0–100 (%)
  const [dragging, setDragging] = useState(false);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed]     = useState(false);
  const TOLERANCE = 5; // ±5%

  const pctFromEvent = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const onMove = useCallback((e) => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    setPos(pctFromEvent(x));
  }, [pctFromEvent]);

  const onUp = useCallback(() => {
    setDragging(false);
    setPos(p => {
      const elapsed = Date.now() - startTime.current;
      // Humans need at least ~300ms to read + drag
      if (Math.abs(p - target) <= TOLERANCE && elapsed > 300) {
        setVerified(true);
        onVerify?.(true);
        return target;
      }
      // fail → shake, reset, new target
      setFailed(true);
      setTimeout(() => {
        setFailed(false);
        setTarget(35 + Math.random() * 55);
        setPos(0);
      }, 450);
      return p;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, onVerify]);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, onMove, onUp]);

  const reset = () => {
    setVerified(false);
    setPos(0);
    setTarget(35 + Math.random() * 55);
    startTime.current = Date.now();
    onVerify?.(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs text-gray-400">
          🤖 {label}
        </label>
        {verified && (
          <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-gray-300">↻</button>
        )}
      </div>
      <div
        ref={trackRef}
        className={`relative h-11 rounded-xl border select-none overflow-hidden transition-colors ${
          verified ? 'border-green-600 bg-green-900/20'
          : failed  ? 'border-red-600 bg-red-900/20'
          : 'border-gray-700 bg-gray-800'
        }`}
        style={failed ? { animation: 'captchaShake .4s ease' } : {}}
      >
        {/* Target zone */}
        {!verified && (
          <div
            className="absolute top-0 bottom-0 bg-blue-500/30 border-x-2 border-blue-400/70 rounded-sm"
            style={{ left: `${target - TOLERANCE}%`, width: `${TOLERANCE * 2}%` }}
          />
        )}
        {/* Progress fill */}
        <div
          className={`absolute top-0 bottom-0 left-0 ${verified ? 'bg-green-600/30' : 'bg-blue-600/20'}`}
          style={{ width: `${pos}%`, transition: dragging ? 'none' : 'width .3s ease' }}
        />
        {/* Handle */}
        <div
          role="slider"
          aria-label="captcha-slider"
          aria-valuenow={Math.round(pos)}
          tabIndex={0}
          onMouseDown={() => { if (!verified) setDragging(true); }}
          onTouchStart={() => { if (!verified) setDragging(true); }}
          onKeyDown={(e) => {
            if (verified) return;
            if (e.key === 'ArrowRight') setPos(p => Math.min(100, p + 2));
            if (e.key === 'ArrowLeft')  setPos(p => Math.max(0, p - 2));
            if (e.key === 'Enter') onUp();
          }}
          className={`absolute top-1 bottom-1 w-12 rounded-lg flex items-center justify-center text-base font-bold shadow-lg ${
            verified ? 'bg-green-600 text-white cursor-default' : 'bg-white text-gray-700 cursor-grab active:cursor-grabbing'
          }`}
          style={{
            left: `calc(${pos}% - ${pos * 0.48}px)`,
            transition: dragging ? 'none' : 'left .3s ease',
          }}
        >
          {verified ? '✓' : '⇄'}
        </div>
        {/* Hint text */}
        {!verified && pos === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-500 text-xs">⟶</span>
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes captchaShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

/**
 * Honeypot — invisible field bots tend to fill in.
 * Pass its value to isBotSubmission() before submitting.
 */
export function Honeypot({ value, onChange }) {
  return (
    <input
      type="text"
      name="website"
      autoComplete="off"
      tabIndex={-1}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
      aria-hidden="true"
    />
  );
}
