'use client';
import { useState, useRef } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';

// ── 汎用入力コンポーネント ────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-300">
        {label}{required && <span className="text-purple-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm
                 focus:outline-none focus:border-purple-500 placeholder-gray-500 transition-colors
                 disabled:opacity-50"
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm
                 focus:outline-none focus:border-purple-500 transition-colors"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── ファイルアップロードエリア ────────────────────────────────
function FileUpload({ label, accept, file, onChange, hint }) {
  const ref = useRef();
  return (
    <div
      onClick={() => ref.current.click()}
      className="border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-xl p-4
                 cursor-pointer transition-colors group text-center"
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => onChange(e.target.files[0] || null)}
      />
      {file ? (
        <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
          <span>✓</span>
          <span className="truncate max-w-xs">{file.name}</span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(null); }}
            className="text-gray-400 hover:text-red-400 ml-1"
          >×</button>
        </div>
      ) : (
        <div className="text-gray-500 group-hover:text-purple-400 transition-colors">
          <div className="text-2xl mb-1">📎</div>
          <div className="text-sm font-medium">{label}</div>
          {hint && <div className="text-xs mt-0.5 text-gray-600">{hint}</div>}
        </div>
      )}
    </div>
  );
}

// ── セクションタイトル ────────────────────────────────────────
function Section({ title, icon }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-4">
      <span className="text-lg">{icon}</span>
      <h3 className="text-white font-bold text-sm uppercase tracking-widest opacity-70">{title}</h3>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────
export default function OwnerOnboarding({ onClose, mode = 'owner' }) {
  const { state, dispatch } = useApp();
  const { theme, currentUser, ownerOnboardingParentOwnerId } = state;
  const { t } = useI18n();
  const isStoreAddition = mode === 'store';

  const [step, setStep] = useState(1); // 1: フォーム, 2: 完了
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 基本情報
  const [applicantName, setApplicantName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [phone, setPhone]                 = useState('');
  const [email, setEmail]                 = useState('');

  // 事業形態
  const [bizType, setBizType] = useState('individual'); // 'individual' | 'corporation'

  // ファイル
  const [idDocument, setIdDocument]     = useState(null);
  const [corpRegistry, setCorpRegistry] = useState(null);
  const [rentalPermit, setRentalPermit] = useState(null);

  // 法人追加情報
  const [corpAddress, setCorpAddress] = useState('');

  // 許認可
  const [invoiceNumber, setInvoiceNumber] = useState('');

  // 銀行情報
  const [bankName, setBankName]               = useState('');
  const [bankBranch, setBankBranch]           = useState('');
  const [bankAccountType, setBankAccountType] = useState('ordinary');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  // メール実在確認（OTP）
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMsg, setOtpMsg]   = useState('');

  const sendEmailOtp = async () => {
    setOtpMsg('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setOtpMsg(t('oo_codeInvalid')); return; }
    setOtpBusy(true);
    try {
      const locale = (typeof window !== 'undefined' && window.localStorage.getItem('bcr_locale')) || 'ja';
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', purpose: 'owner_email', email, locale }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'send_failed');
      setOtpSent(true);
      setOtpMsg(json?.devNoEmail ? `${t('oo_codeSent')} (dev code: ${json.devCode})` : t('oo_codeSent'));
    } catch (e) {
      setOtpMsg(e.message === 'send_failed' ? t('oo_codeSendFailed') : (e.message || t('oo_codeSendFailed')));
    } finally { setOtpBusy(false); }
  };

  const verifyEmailOtp = async () => {
    setOtpMsg('');
    if (!/^\d{6}$/.test(otpCode)) { setOtpMsg(t('oo_codeInvalid')); return; }
    setOtpBusy(true);
    try {
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', purpose: 'owner_email', email, code: otpCode }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'invalid_code');
      setEmailVerified(true); setVerifiedEmail(email); setOtpSent(false); setOtpCode('');
      setOtpMsg(t('oo_verified'));
    } catch {
      setOtpMsg(t('oo_codeInvalid'));
    } finally { setOtpBusy(false); }
  };

  const handleSubmit = async () => {
    setError('');

    // バリデーション
    if (isStoreAddition) {
      if (!storeLocation || !phone || !email) {
        setError(t('oo_storeAddErrBasic')); return;
      }
    } else if (!applicantName || !storeLocation || !phone || !email) {
      setError(t('oo_errBasic')); return;
    }
    if (!isStoreAddition && (!emailVerified || email !== verifiedEmail)) {
      setError(t('oo_verifyRequired')); return;
    }
    if (!isStoreAddition && bizType === 'individual' && !idDocument) {
      setError(t('oo_errIdDoc')); return;
    }
    if (!isStoreAddition && bizType === 'corporation' && (!corpRegistry || !corpAddress)) {
      setError(t('oo_errCorp')); return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('userId',        currentUser?.id ?? '');
      if (isStoreAddition && ownerOnboardingParentOwnerId) {
        fd.append('parentOwnerId', ownerOnboardingParentOwnerId);
      }
      fd.append('applicantName', isStoreAddition
        ? (currentUser?.name || currentUser?.email || t('oo_storeAddApplicantFallback'))
        : applicantName);
      fd.append('storeLocation', storeLocation);
      fd.append('phone',         phone);
      fd.append('email',         email);
      fd.append('businessType',  isStoreAddition ? 'additional_store' : bizType);
      if (!isStoreAddition) {
        fd.append('corpAddress',   corpAddress);
        fd.append('invoiceNumber', invoiceNumber);
        fd.append('bankName',           bankName);
        fd.append('bankBranch',         bankBranch);
        fd.append('bankAccountType',    bankAccountType);
        fd.append('bankAccountNumber',  bankAccountNumber);
        fd.append('bankAccountHolder',  bankAccountHolder);
        if (idDocument)   fd.append('idDocument',   idDocument);
        if (corpRegistry) fd.append('corpRegistry', corpRegistry);
        if (rentalPermit) fd.append('rentalPermit', rentalPermit);
      }

      const res = await fetch('/api/owners', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('oo_errGeneric'));

      setStep(2);
      dispatch({ type: 'TOAST', msg: isStoreAddition ? t('oo_storeAddSubmitted') : t('oo_toastSubmitted') });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 完了画面 ──
  if (step === 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">{isStoreAddition ? t('oo_storeAddDoneTitle') : t('oo_doneTitle')}</h2>
        <p className="text-gray-400 text-sm mb-8 max-w-sm">
          {isStoreAddition ? t('oo_storeAddDoneDesc') : t('oo_doneDesc')}
        </p>
        <button
          onClick={onClose}
          className="px-8 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
        >
          {t('oo_close')}
        </button>
      </div>
    );
  }

  // ── フォーム画面 ──
  return (
    <div className="max-w-2xl mx-auto">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-4"
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
        >
          🏪
        </div>
        <h2 className="text-2xl font-bold text-white">{isStoreAddition ? t('oo_storeAddTitle') : t('oo_title')}</h2>
        <p className="text-gray-400 text-sm mt-1">{isStoreAddition ? t('oo_storeAddSubtitle') : t('oo_subtitle')}</p>
      </div>

      <div className="space-y-4">
        {/* ── 基本情報 ── */}
        <Section title={t('oo_secBasic')} icon="🏢" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!isStoreAddition && (
            <Field label={t('oo_applicantName')} required>
              <Input value={applicantName} onChange={setApplicantName} placeholder={t('oo_phApplicantName')} />
            </Field>
          )}
          <Field label={t('oo_storeLocation')} required>
            <Input value={storeLocation} onChange={setStoreLocation} placeholder={t('oo_phStoreLocation')} />
          </Field>
          <Field label={t('oo_phone')} required>
            <Input value={phone} onChange={setPhone} placeholder="090-0000-0000" type="tel" />
          </Field>
          <Field label={isStoreAddition ? t('oo_storeEmail') : t('oo_email')} required>
            {isStoreAddition ? (
              <Input value={email} onChange={setEmail} placeholder="store@example.com" type="email" />
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={email}
                      onChange={(v) => { setEmail(v); if (v !== verifiedEmail) setEmailVerified(false); }}
                      placeholder="owner@example.com"
                      type="email"
                    />
                  </div>
                  {emailVerified ? (
                    <span className="flex items-center gap-1 rounded-xl bg-green-900/30 px-3 text-xs font-bold text-green-300 whitespace-nowrap">✓ {t('oo_verified')}</span>
                  ) : (
                    <button type="button" onClick={sendEmailOtp} disabled={otpBusy}
                      className="rounded-xl border border-purple-600 px-3 text-xs font-bold text-purple-300 whitespace-nowrap hover:bg-purple-900/30 disabled:opacity-50">
                      {otpBusy ? t('oo_sending') : t('oo_sendCode')}
                    </button>
                  )}
                </div>
                {otpSent && !emailVerified && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric" maxLength={6}
                      placeholder={t('oo_enterCode')}
                      className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm tracking-widest text-white focus:border-purple-500 focus:outline-none"
                    />
                    <button type="button" onClick={verifyEmailOtp} disabled={otpBusy}
                      className="rounded-xl bg-purple-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                      {t('oo_verify')}
                    </button>
                  </div>
                )}
                {otpMsg && <p className="mt-1 text-xs text-gray-400">{otpMsg}</p>}
              </>
            )}
          </Field>
        </div>

        {isStoreAddition && (
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/30 px-4 py-3 text-sm text-purple-100">
            {t('oo_storeAddReviewNote')}
          </div>
        )}

        {!isStoreAddition && (
          <>
        {/* ── Business type ── */}
        <Section title={t('oo_bizType')} icon="📋" />
        <div className="flex gap-3">
          {[
            { value: 'individual', label: `👤 ${t('oo_individual')}` },
            { value: 'corporation', label: `🏢 ${t('oo_corp')}` },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setBizType(opt.value)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all ${
                bizType === opt.value
                  ? 'border-purple-500 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
              style={bizType === opt.value
                ? { background: `linear-gradient(135deg, ${theme.primary}33, ${theme.accent}22)` }
                : {}
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 個人: 身分証 */}
        {bizType === 'individual' && (
          <div className="space-y-3 animate-fadeIn">
            <Field label={t('oo_idDoc')} required>
              <FileUpload
                label={t('oo_idDocUpload')}
                accept="image/*,.pdf"
                file={idDocument}
                onChange={setIdDocument}
                hint={t('oo_idDocHint')}
              />
            </Field>
          </div>
        )}

        {/* 法人: 登記謄本 + 住所 */}
        {bizType === 'corporation' && (
          <div className="space-y-3 animate-fadeIn">
            <Field label={t('oo_corpAddress')} required>
              <Input value={corpAddress} onChange={setCorpAddress} placeholder={t('oo_phCorpAddress')} />
            </Field>
            <Field label={t('oo_corpRegistry')} required>
              <FileUpload
                label={t('oo_corpRegistryUpload')}
                accept="image/*,.pdf"
                file={corpRegistry}
                onChange={setCorpRegistry}
                hint={t('oo_corpRegistryHint')}
              />
            </Field>
          </div>
        )}

        {/* ── 許認可情報 ── */}
        <Section title={t('oo_secLicense')} icon="📄" />
        <Field label={t('oo_rentalPermit')}>
          <FileUpload
            label={t('oo_rentalPermitUpload')}
            accept="image/*,.pdf"
            file={rentalPermit}
            onChange={setRentalPermit}
            hint={t('oo_rentalPermitHint')}
          />
        </Field>
        <Field label={t('oo_invoice')}>
          <Input value={invoiceNumber} onChange={setInvoiceNumber} placeholder="T1234567890123" />
        </Field>

        {/* ── 銀行口座情報（任意・後から登録できる） ── */}
        <Section title={t('oo_secBank')} icon="🏦" />
        <p className="-mt-2 mb-1 flex items-center gap-2 text-xs text-gray-500">
          <span className="rounded-md border border-gray-700 bg-gray-800/60 px-1.5 py-0.5 text-[10px] font-bold text-gray-300">{t('po_optional')}</span>
          {t('po_bankOptionalHint')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('oo_bankName')}>
            <Input value={bankName} onChange={setBankName} placeholder={t('oo_phBankName')} />
          </Field>
          <Field label={t('oo_bankBranch')}>
            <Input value={bankBranch} onChange={setBankBranch} placeholder={t('oo_phBankBranch')} />
          </Field>
          <Field label={t('oo_acctType')}>
            <Select
              value={bankAccountType}
              onChange={setBankAccountType}
              options={[
                { value: 'ordinary', label: t('oo_acctOrdinary') },
                { value: 'checking', label: t('oo_acctChecking') },
                { value: 'savings',  label: t('oo_acctSavings') },
              ]}
            />
          </Field>
          <Field label={t('oo_acctNo')}>
            <Input value={bankAccountNumber} onChange={setBankAccountNumber} placeholder="1234567" />
          </Field>
          <Field label={t('oo_acctHolder')}>
            <Input value={bankAccountHolder} onChange={setBankAccountHolder} placeholder={t('oo_phAcctHolder')} />
          </Field>
        </div>
          </>
        )}

        {/* エラー */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 送信ボタン */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-4 rounded-xl text-white font-bold text-sm mt-6 transition-opacity disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
        >
          {loading ? t('oo_submitting') : (isStoreAddition ? t('oo_storeAddSubmit') : t('oo_submit'))}
        </button>

        <p className="text-center text-xs text-gray-600 pb-4">
          {isStoreAddition ? t('oo_storeAddFooter') : t('oo_footer')}
        </p>
      </div>
    </div>
  );
}
