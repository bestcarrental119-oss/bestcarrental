'use client';
import { useState, useRef } from 'react';
import { useI18n } from '../lib/i18nContext';

/**
 * Vehicle main photo uploader.
 * Converts image to base64 dataURL for immediate frontend display.
 * In production, swap the base64 logic for a Vercel Blob / Cloudinary upload.
 *
 * Props:
 *   value    – current image URL or dataURL
 *   onChange – called with { url } where url is dataURL (demo) or remote URL (prod)
 */
export default function VehicleImageUploader({ value, onChange }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_MB = 8;

  const handleFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) { setError(t('viu_errFileType')); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(t('viu_errFileSize').replace('{mb}', MAX_MB)); return; }
    setError('');
    setUploading(true);

    // ── Demo: convert to base64 dataURL so it appears instantly on frontend ──
    // Production: replace with Vercel Blob upload
    //   const formData = new FormData();
    //   formData.append('file', file);
    //   const res = await fetch('/api/upload', { method: 'POST', body: formData });
    //   const { url } = await res.json();
    //   onChange({ url });
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploading(false);
      onChange({ url: e.target.result }); // dataURL stored as v.img
    };
    reader.onerror = () => { setUploading(false); setError(t('viu_errRead')); };
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };
  const clear  = () => { onChange({ url: '' }); if (inputRef.current) inputRef.current.value = ''; };

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">Vehicle Photo</label>

      {value ? (
        /* Preview */
        <div className="relative rounded-xl overflow-hidden border border-gray-700 group">
          <img src={value} alt="Vehicle" className="w-full h-48 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="flex gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="bg-white text-gray-900 text-xs font-bold px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                📷 Replace
              </button>
              <button
                onClick={clear}
                className="bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors"
              >
                🗑 Remove
              </button>
            </div>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="flex items-center gap-2 text-white text-sm">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading…
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Drop zone */
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragging ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-purple-600 hover:bg-gray-800/60'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Uploading…</p>
            </div>
          ) : (
            <>
              <div className="text-5xl mb-3">📷</div>
              <p className="text-gray-300 text-sm font-medium mb-1">Drag & drop or click to upload</p>
              <p className="text-gray-500 text-xs">JPG / PNG / WebP · Max {MAX_MB}MB</p>
              <p className="text-purple-400 text-xs mt-2">Photo is saved and shown to customers on the frontend</p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={e => handleFile(e.target.files[0])}
        className="hidden"
      />
    </div>
  );
}
