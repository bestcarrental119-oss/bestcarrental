'use client';

// ── Gradient helper ──────────────────────────────────────────────────────────
export function grad(theme, dir = '90deg') {
  return `linear-gradient(${dir}, ${theme.primary}, ${theme.accent})`;
}

// ── Gradient button ──────────────────────────────────────────────────────────
export function GradBtn({ children, onClick, className = '', style = {}, disabled = false, theme }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: grad(theme), ...style }}
      className={`text-white font-bold rounded-xl transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, children, wide = false }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1300] flex items-stretch justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={`relative bg-gray-900 border border-gray-700 shadow-2xl ${wide ? 'w-full sm:max-w-2xl' : 'w-full sm:max-w-lg'} max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl`}
        style={{ animation: 'fadeUp .25s ease', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-800/90 text-gray-300 text-xl leading-none shadow-md ring-1 ring-gray-700 hover:bg-gray-700 hover:text-white transition-colors"
            style={{ top: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
          >
            ⊗
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ msg, action = null, onAction }) {
  if (!msg) return null;
  const clickable = Boolean(action);
  return (
    <div
      onClick={clickable ? onAction : undefined}
      role={clickable ? 'button' : undefined}
      className={`fixed bottom-6 right-6 z-[100] bg-gray-800 border text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-xs ${
        clickable ? 'cursor-pointer border-purple-500 hover:bg-gray-700 active:scale-95 transition-all' : 'border-gray-600'
      }`}
      style={{ animation: 'toastIn .3s ease' }}
    >
      <span className="text-green-400 text-lg">{clickable ? '💬' : '✓'}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm block">{msg}</span>
        {clickable && <span className="text-[11px] text-purple-300">タップで開く ›</span>}
      </div>
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, value, onChange, type = 'text', placeholder = '', className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block text-xs text-gray-400 mb-1">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block text-xs text-gray-400 mb-1">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
      >
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    confirmed:    ['bg-blue-900/40 text-blue-300',   'Confirmed'],
    in_progress:  ['bg-green-900/40 text-green-300', 'In Progress'],
    pending:      ['bg-yellow-900/40 text-yellow-300','Pending'],
    completed:    ['bg-gray-800 text-gray-400',       'Completed'],
    cancelled:    ['bg-red-900/40 text-red-300',      'Cancelled'],
    rejected:     ['bg-red-900/40 text-red-300',      'Rejected'],
    active:       ['bg-green-900/40 text-green-300',  'Active'],
    maintenance:  ['bg-yellow-900/40 text-yellow-300','Maintenance'],
    inactive:     ['bg-gray-800 text-gray-500',       'Inactive'],
  };
  const [cls, lbl] = map[status] ?? ['bg-gray-800 text-gray-400', status];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
  );
}

// ── Tag ──────────────────────────────────────────────────────────────────────
export function Tag({ children }) {
  return (
    <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-md border border-gray-700/50">
      {children}
    </span>
  );
}
