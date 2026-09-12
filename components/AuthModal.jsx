'use client';
import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';
import { Modal, GradBtn, Input } from './Shared';
import CountryPhoneInput from './CountryPhoneInput';
import { supabase } from '../lib/supabase';
import { isMasterUser } from '../lib/master';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 国際電話番号（+任意、数字/スペース/ハイフン、8〜15桁）
const PHONE_RE = /^\+?[0-9][0-9\s-]{7,14}$/;

export default function AuthModal() {
  const { state, dispatch } = useApp();
  const { locale, t } = useI18n();
  const { authOpen, authMode, theme } = state;

  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [pass,    setPass]    = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  // ── 登録メール認証（6桁コード）─────────────────────────────────────────────
  // step: 'form'（入力） | 'verify'（コード入力） | 'forgot'（パスワード再設定）
  const [step, setStep]       = useState('form');
  const [otp, setOtp]         = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [info, setInfo]       = useState('');

  // ── 防机器人验证（簡易ボット対策・外部キー不要の計算チャレンジ）──────────
  const [captcha, setCaptcha] = useState({ a: 0, b: 0 });
  const [captchaAns, setCaptchaAns] = useState('');
  const newCaptcha = () => {
    setCaptcha({ a: Math.floor(Math.random() * 8) + 1, b: Math.floor(Math.random() * 8) + 1 });
    setCaptchaAns('');
  };
  useEffect(() => { if (authOpen) { newCaptcha(); setStep('form'); setOtp(''); setErr(''); setInfo(''); } }, [authOpen, authMode]);
  const captchaValid = Number(captchaAns) === captcha.a + captcha.b;

  // 再送カウントダウン
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const close = () => {
    dispatch({ type: 'SET_AUTH', open: false });
    setErr(''); setInfo(''); setStep('form'); setOtp('');
  };

  const handleLogin = async () => {
    if (!captchaValid) { setErr(t('am_errCaptcha')); newCaptcha(); return; }
    if (!EMAIL_RE.test(email)) { setErr(t('am_errEmailFormat')); return; }
    setLoading(true); setErr('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if (error) { setErr(error.message); newCaptcha(); return; }
    const u = data.user;
    const master = isMasterUser(u);
    dispatch({ type: 'SET_USER', user: {
      id:    u.id,
      name:  u.user_metadata?.name || u.email,
      email: u.email,
      role:  master ? 'admin' : (u.user_metadata?.role || u.app_metadata?.role || 'user'),
      isMaster: master,
      phone: u.user_metadata?.phone || u.user_metadata?.bookingProfile?.phone || '',
      bookingProfile: u.user_metadata?.bookingProfile ?? {},
    }});
    dispatch({ type: 'TOAST', msg: t('am_welcomeBackToast') });
  };

  // ── 新規登録: ①入力チェック → ②認証コード送信 → コード入力画面へ ─────────
  const handleSendSignupCode = async () => {
    if (!name || !email || !pass) { setErr(t('am_errRequiredFields')); return; }
    if (!captchaValid) { setErr(t('am_errCaptcha')); newCaptcha(); return; }
    if (!EMAIL_RE.test(email)) { setErr(t('am_errEmailFormat')); return; }
    if (!PHONE_RE.test(phone)) { setErr(t('am_errPhoneFormat')); return; }
    if (pass.length < 6) { setErr(t('am_errPassLen')); return; }
    setLoading(true); setErr(''); setInfo('');
    try {
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', purpose: 'signup', email, locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'email_in_use') { setErr(t('am_errEmailInUse')); }
        else if (data.error === 'too_soon') { setErr(t('am_errTooSoon').replace('{n}', data.retryAfter)); }
        else if (data.error === 'email_not_configured') { setErr(t('am_errEmailNotConfigured')); }
        else { setErr(t('am_errSendCodeFailed')); }
        return;
      }
      setStep('verify');
      setResendIn(60);
      setInfo(t('am_codeSent').replace('{email}', email));
      if (data.devCode) setInfo(t('am_devCode').replace('{code}', data.devCode));
    } catch {
      setErr(t('am_errNetwork'));
    } finally { setLoading(false); }
  };

  // ── コード検証 → アカウント作成 → 自動ログイン ─────────────────────────────
  const handleVerifyAndCreate = async () => {
    if (!/^\d{6}$/.test(otp)) { setErr(t('am_errOtpFormat')); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', purpose: 'signup', email, code: otp, register: { name, phone, password: pass } }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'mismatch') setErr(t('am_errOtpMismatch').replace('{n}', data.remaining ?? ''));
        else if (data.error === 'expired') setErr(t('am_errOtpExpired'));
        else if (data.error === 'too_many') setErr(t('am_errOtpTooMany'));
        else setErr(t('am_errVerifyFailed'));
        return;
      }

      // サーバー側で作成できなかった場合（サービスロール未設定）はクライアントで作成
      if (data.createClientSide) {
        const { error } = await supabase.auth.signUp({
          email, password: pass, options: { data: { name, phone, role: 'user', bookingProfile: { phone } } },
        });
        if (error) { setErr(error.message); return; }
      }

      // 自動ログイン
      const { data: signIn, error: siErr } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (siErr || !signIn?.user) {
        dispatch({ type: 'TOAST', msg: t('am_accountCreatedLogin') });
        dispatch({ type: 'SET_AUTH', open: true, mode: 'login' });
        setStep('form');
        return;
      }
      const u = signIn.user;
      dispatch({ type: 'SET_USER', user: {
        id: u.id, name, email: u.email, role: 'user', phone, bookingProfile: { phone },
      }});
      dispatch({ type: 'TOAST', msg: t('am_welcomeUserToast').replace('{name}', name) });
      dispatch({ type: 'SET_AUTH', open: false });
    } catch {
      setErr(t('am_errNetwork'));
    } finally { setLoading(false); }
  };

  const resendCode = async () => {
    if (resendIn > 0) return;
    await handleSendSignupCode();
  };

  // ── パスワード再設定メール送信 ─────────────────────────────────────────────
  const handleForgot = async () => {
    if (!EMAIL_RE.test(email)) { setErr(t('am_errEnterEmail')); return; }
    setLoading(true); setErr(''); setInfo('');
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === 'too_soon') {
          setErr(t('am_errTooSoon').replace('{n}', data.retryAfter ?? 60));
        } else if (data?.error === 'email_not_configured') {
          setErr(t('am_errEmailNotConfigured'));
        } else if (data?.error === 'invalid_email') {
          setErr(t('am_errEnterEmail'));
        } else {
          setErr(data?.error || t('am_errNetwork'));
        }
        return;
      }
      setInfo(t('am_resetSent').replace('{email}', email));
    } catch {
      setErr(t('am_errNetwork'));
    } finally { setLoading(false); }
  };

  const isLogin = authMode === 'login';

  // ── 認証コード入力画面 ─────────────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <Modal open={authOpen} onClose={close}>
        <div className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-4"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>📧</div>
            <h2 className="text-2xl font-bold text-white">{t('am_verifyTitle')}</h2>
            <p className="text-gray-400 text-sm mt-1">{info || t('am_verifySubDefault').replace('{email}', email)}</p>
          </div>
          <div className="space-y-4">
            <input
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="______"
              className="w-full text-center tracking-[0.6em] font-mono text-2xl bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-3 focus:outline-none focus:border-blue-500"
            />
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <GradBtn theme={theme} onClick={handleVerifyAndCreate} className="w-full py-3 text-sm" disabled={loading}>
              {loading ? t('am_verifying') : t('am_verifyCreate')}
            </GradBtn>
            <div className="flex items-center justify-between text-sm">
              <button className="text-gray-400 hover:text-white" onClick={() => { setStep('form'); setErr(''); }}>{t('am_back')}</button>
              <button className="font-semibold disabled:opacity-40" style={{ color: theme.primary }}
                onClick={resendCode} disabled={resendIn > 0 || loading}>
                {resendIn > 0 ? t('am_resendCountdown').replace('{n}', resendIn) : t('am_resend')}
              </button>
            </div>
          </div>
          <button onClick={close} className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl">×</button>
        </div>
      </Modal>
    );
  }

  // ── パスワード忘れ画面 ─────────────────────────────────────────────────────
  if (step === 'forgot') {
    return (
      <Modal open={authOpen} onClose={close}>
        <div className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-4"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}>🔑</div>
            <h2 className="text-2xl font-bold text-white">{t('am_forgotTitle')}</h2>
            <p className="text-gray-400 text-sm mt-1">{t('am_forgotSub')}</p>
          </div>
          <div className="space-y-4">
            <Input label={t('am_email')} type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            {info && <p className="text-green-400 text-sm">{info}</p>}
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <GradBtn theme={theme} onClick={handleForgot} className="w-full py-3 text-sm" disabled={loading}>
              {loading ? t('am_sending') : t('am_sendResetEmail')}
            </GradBtn>
            <button className="w-full text-center text-sm text-gray-400 hover:text-white"
              onClick={() => { setStep('form'); setErr(''); setInfo(''); }}>{t('am_backToLogin')}</button>
          </div>
          <button onClick={close} className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl">×</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={authOpen} onClose={close}>
      <div className="p-8">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-4"
            style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
          >
            {isLogin ? '🔑' : '✨'}
          </div>
          <h2 className="text-2xl font-bold text-white">
            {isLogin ? t('am_welcomeBack') : t('am_createAccount')}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {isLogin ? t('am_loginSub') : t('am_registerSub')}
          </p>
        </div>

        <div className="space-y-4">
          {!isLogin && (
            <Input label={t('am_fullName')} value={name} onChange={setName} placeholder={t('am_namePlaceholder')} />
          )}
          <Input label={t('am_email')} type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          {!isLogin && (
            <CountryPhoneInput label={t('am_phoneLabel')} value={phone} onChange={setPhone} />
          )}
          <Input label={t('am_password')} type="password" value={pass} onChange={setPass} placeholder="••••••••" />

          {isLogin && (
            <div className="text-right -mt-1">
              <button type="button" className="text-xs text-gray-400 hover:text-white"
                onClick={() => { setStep('forgot'); setErr(''); setInfo(''); }}>
                {t('am_forgotPassword')}
              </button>
            </div>
          )}

          {/* human verification */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('am_botCheckLabel')}</label>
            <div className="flex items-center gap-2">
              <span className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm font-mono select-none">
                {captcha.a} + {captcha.b} = ?
              </span>
              <input
                type="number"
                value={captchaAns}
                onChange={e => setCaptchaAns(e.target.value)}
                placeholder="?"
                className="w-20 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <button type="button" onClick={newCaptcha} className="text-gray-500 hover:text-white text-sm px-2" aria-label="Refresh">↻</button>
              {captchaAns !== '' && (
                <span className={`text-sm ${captchaValid ? 'text-green-400' : 'text-red-400'}`}>{captchaValid ? '✓' : '✗'}</span>
              )}
            </div>
          </div>

          {info && <p className="text-green-400 text-sm">{info}</p>}
          {err && <p className="text-red-400 text-sm">{err}</p>}

          <GradBtn
            theme={theme}
            onClick={isLogin ? handleLogin : handleSendSignupCode}
            className="w-full py-3 text-sm"
            disabled={loading}
          >
            {loading ? t('am_processing') : isLogin ? t('am_signInBtn') : t('am_sendCodeContinue')}
          </GradBtn>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          {isLogin ? t('am_noAccount') : t('am_haveAccount')}
          <button
            className="font-semibold hover:underline"
            style={{ color: theme.primary }}
            onClick={() => dispatch({ type: 'SET_AUTH', open: true, mode: isLogin ? 'register' : 'login' })}
          >
            {isLogin ? t('am_signUpLink') : t('am_signInLink')}
          </button>
        </p>

        <button
          onClick={close}
          className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl"
        >×</button>
      </div>
    </Modal>
  );
}
