'use client';
import { useState, useRef } from 'react';
import { useI18n } from '../lib/i18nContext';

/**
 * Drag-and-drop file uploader for vehicle inspection certificates.
 * Accepts JPG, PNG, PDF.
 *
 * Props:
 *   value    – current URL string (existing file)
 *   onChange – called with { url, file, previewUrl }
 */
export default function InspectionUploader({ value, onChange, label: labelProp }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const MAX_MB = 2;

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.readAsDataURL(file);
  });

  const handleFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Invalid file type. Please upload JPG, PNG, or PDF.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_MB}MB.`);
      return;
    }
    setError('');
    setFileName(file.name);

    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPreview(file.type.startsWith('image/') ? dataUrl : 'pdf');
      onChange?.({ url: dataUrl, file, previewUrl: file.type.startsWith('image/') ? dataUrl : null });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const clear = () => {
    setPreview(null);
    setFileName('');
    onChange?.({ url: '', file: null, previewUrl: null });
    if (inputRef.current) inputRef.current.value = '';
  };

  const hasFile = preview || value;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{labelProp ?? t('inspectionCert')}</label>

      {hasFile ? (
        /* Preview state */
        <div className="border border-purple-200 rounded-2xl overflow-hidden bg-purple-50">
          {preview === 'pdf' || (value && (value.endsWith('.pdf') || value.startsWith('data:application/pdf'))) ? (
            <div className="flex items-center gap-3 p-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{fileName || 'inspection_certificate.pdf'}</p>
                <p className="text-xs text-gray-500">PDF Document</p>
              </div>
              <button onClick={clear} className="text-gray-400 hover:text-red-500 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="relative">
              <img
                src={preview || value}
                alt="Inspection certificate preview"
                className="w-full h-40 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <button
                onClick={clear}
                className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm transition-colors"
              >×</button>
              <p className="absolute bottom-2 left-3 text-white text-xs font-medium truncate max-w-[80%]">{fileName}</p>
            </div>
          )}

          {uploading && (
            <div className="px-4 py-2 border-t border-purple-200">
              <div className="flex items-center gap-2 text-purple-600 text-xs">
                <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
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
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragging
              ? 'border-purple-400 bg-purple-50'
              : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
          }`}
        >
          <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">{t('dragDrop')}</p>
          <p className="text-xs text-gray-400">{t('uploadFile')}</p>
          <p className="text-xs text-gray-300 mt-1">Max {MAX_MB}MB</p>

          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={e => handleFile(e.target.files[0])}
            className="hidden"
          />
        </div>
      )}

      {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
    </div>
  );
}
