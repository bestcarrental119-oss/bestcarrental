'use client';
import { useI18n } from '../lib/i18nContext';

/**
 * 損害補償の同意（¥0カード登録の説明＋必須チェック）。
 * 事故・破損時に登録カードへ後日実費請求できることに同意させる。
 * props: checked(bool), onToggle()
 */
export default function DamageConsent({ checked, onToggle }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-amber-700/40 bg-amber-900/15 p-3">
      <p className="text-sm font-bold text-amber-200">🛡 {t('sc_consentTitle')}</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-100/85">{t('sc_consentBody')}</p>
      <p className="mt-1 text-[11px] text-amber-200/70">💳 {t('sc_cardOnFileNote')}</p>
      <button
        type="button"
        onClick={onToggle}
        className={`mt-2 flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-all ${
          checked ? 'border-emerald-500 bg-emerald-900/20' : 'border-amber-700/40 bg-black/20'
        }`}
      >
        <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
          checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-amber-400 text-transparent'
        }`}>✓</span>
        <span className="text-xs font-semibold text-white">{t('sc_consentCheck')}</span>
      </button>
    </div>
  );
}
