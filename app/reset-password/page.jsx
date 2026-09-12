'use client';
/**
 * Password reset landing page.
 *
 * Supabase's password-recovery email links here (redirectTo=/reset-password).
 * When the link is opened, the Supabase client either parses the recovery token
 * from the URL hash or exchanges a ?code= callback for a session. The user then
 * sets a new password with that recovery session.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const INVALID_LINK_MESSAGE =
  'このパスワードリセットリンクは期限切れ、または無効です。ログイン画面から新しいリセットメールを送信してください。/ This reset link expired or is invalid. Please send a new reset email.';

function recoveryHashErrorMessage() {
  const hash = window.location.hash?.replace(/^#/, '') ?? '';
  if (!hash) return '';
  const params = new URLSearchParams(hash);
  const code = params.get('error_code');
  const description = params.get('error_description');
  if (code === 'otp_expired') return INVALID_LINK_MESSAGE;
  if (params.get('error')) return description || INVALID_LINK_MESSAGE;
  return '';
}

export default function ResetPasswordPage() {
  const [ready, setReady]   = useState(false);   // recovery session established
  const [pass, setPass]     = useState('');
  const [pass2, setPass2]   = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [err, setErr]       = useState('');
  const [linkErr, setLinkErr] = useState('');

  useEffect(() => {
    // If the user already has a recovery session (event may fire before mount),
    // check immediately, then also listen for the PASSWORD_RECOVERY event.
    const init = async () => {
      const linkError = recoveryHashErrorMessage();
      if (linkError) {
        setLinkErr(linkError);
        return;
      }

      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setLinkErr(INVALID_LINK_MESSAGE);
          return;
        }
        window.history.replaceState(null, '', '/reset-password');
        setReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data?.session) setReady(true);
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const submit = async () => {
    setErr('');
    if (pass.length < 6) { setErr('パスワードは6文字以上にしてください。/ At least 6 characters.'); return; }
    if (pass !== pass2)  { setErr('パスワードが一致しません。/ Passwords do not match.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) { setErr(error.message); return; }
      setDone(true);
    } catch (e) {
      setErr(e.message || '更新に失敗しました。/ Update failed.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b12', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#15151f', border: '1px solid #26263a', borderRadius: 20, padding: 32, color: '#fff', fontFamily: '-apple-system, Segoe UI, sans-serif' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 4px' }}>パスワード再設定</h1>
          <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>Set a new password</p>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#34d399', fontSize: 15, fontWeight: 600 }}>✓ パスワードを更新しました。</p>
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>新しいパスワードでログインできます。</p>
            <a href="/" style={{ display: 'inline-block', marginTop: 20, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '11px 24px', borderRadius: 12 }}>アプリに戻る →</a>
          </div>
        ) : linkErr ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#f87171', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{linkErr}</p>
            <a href="/" style={{ display: 'inline-block', marginTop: 20, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '11px 24px', borderRadius: 12 }}>アプリに戻る →</a>
          </div>
        ) : !ready ? (
          <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
            リンクを確認しています…<br />
            <span style={{ fontSize: 12 }}>メール内のリンクからこのページを開いてください。<br />If you opened this directly, use the link in your reset email.</span>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>新しいパスワード / New password</label>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••"
                style={{ width: '100%', boxSizing: 'border-box', background: '#0f0f18', border: '1px solid #33334d', color: '#fff', borderRadius: 10, padding: '11px 14px', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>確認のため再入力 / Confirm</label>
              <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="••••••••"
                style={{ width: '100%', boxSizing: 'border-box', background: '#0f0f18', border: '1px solid #33334d', color: '#fff', borderRadius: 10, padding: '11px 14px', fontSize: 14 }} />
            </div>
            {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
            <button onClick={submit} disabled={saving}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 12, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '更新中…' : 'パスワードを更新'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
