'use client';

// App Router error boundary.
// Instead of the blank "client-side exception" screen, this shows the real
// error message and stack so problems can be diagnosed on a phone (no console).
export default function Error({ error, reset }) {
  const info = [
    error?.name && `${error.name}: ${error.message ?? ''}`,
    error?.message && !error?.name ? error.message : null,
    error?.digest ? `digest: ${error.digest}` : null,
    error?.stack || null,
  ]
    .filter(Boolean)
    .join('\n\n');

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px', background: '#fff', color: '#111', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>エラーが発生しました</h1>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px' }}>
        下の内容をスクリーンショットで送ってください。原因を特定して修正します。
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, background: '#f5f5f7', border: '1px solid #e5e5ea', borderRadius: 12, padding: 12, color: '#b00020', maxHeight: '55vh', overflow: 'auto' }}>
        {info || 'No error details available.'}
      </pre>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => reset()}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 600 }}
        >
          再試行
        </button>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{ background: '#f0f0f3', color: '#333', border: '1px solid #ddd', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 600 }}
        >
          ホームへ
        </button>
      </div>
    </div>
  );
}
