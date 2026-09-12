'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * 電子署名パッド（キャンバスに手書き＋氏名入力）。
 * value: { dataUrl, name, signedAt } / onChange で同形を返す。
 * 署名が空になったら onChange(null)。
 */
export default function SignaturePad({ value, onChange, t, contractHref }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(Boolean(value?.dataUrl));
  const [name, setName] = useState(value?.name ?? '');

  // 高DPIでにじまないようキャンバスを初期化
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    // 既存署名があれば復元
    if (value?.dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value.dataUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emit(name);
  };

  const emit = (nm) => {
    if (!hasInk.current) { onChange?.(null); return; }
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange?.({ dataUrl, name: nm ?? '', signedAt: new Date().toISOString() });
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    onChange?.(null);
  };

  return (
    <div className="rounded-xl border border-purple-700/40 bg-purple-900/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-purple-100">✍️ {t('sig_title')}</p>
        {contractHref && (
          <a href={contractHref} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-300 underline hover:text-white">{t('sig_view')}</a>
        )}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-gray-400">{t('sig_hint')}</p>

      <input
        value={name}
        onChange={e => { setName(e.target.value); emit(e.target.value); }}
        placeholder={t('sig_namePh')}
        className="mb-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
      />

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-lg border border-dashed border-gray-500 bg-white"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        <button type="button" onClick={clear}
          className="absolute right-2 top-2 rounded-md bg-gray-800/80 px-2 py-1 text-[11px] font-semibold text-white active:scale-95">
          {t('sig_clear')}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">{t('sig_agree')}</p>
    </div>
  );
}
