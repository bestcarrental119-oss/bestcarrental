'use client';
import { useState } from 'react';
import { useApp } from '../../lib/context';
import { useI18n } from '../../lib/i18nContext';
import LoaderOverlay from '../LoaderOverlay';

/**
 * トップページ用「Best Match」導線バナー。
 * タップすると Best Match 専用のローディング画面（画像＋アニメ）を挟んで遷移。
 */
export default function OneWayBanner() {
  const { dispatch } = useApp();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const go = () => {
    if (loading) return;
    setLoading(true);
    window.scrollTo(0, 0);
    setTimeout(() => { dispatch({ type: 'SET_PAGE', v: 'one-way' }); }, 1700);
  };

  return (
    <>
    {loading && (
      <div className="app-loader" aria-hidden="true">
        <LoaderOverlay src="/loading-oneway.jpg" />
      </div>
    )}
    <button
      type="button"
      onClick={go}
      className="group relative block w-full overflow-hidden rounded-3xl p-[1.5px] text-left shadow-lg active:scale-[0.99] transition-transform"
      style={{ background: 'linear-gradient(120deg,#7c3aed,#a855f7,#c4b5fd)' }}
    >
      <div className="relative flex items-center gap-3 rounded-[22px] bg-white px-4 py-3.5">
        {/* サイバーな装飾（白×紫） */}
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-purple-400/15 blur-2xl" />

        {/* アイコン画像（public/oneway-icon.png）— 無い場合はグラデ＋矢印 */}
        <span
          className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-md ring-1 ring-purple-200"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}
        >
          <span className="text-2xl text-white">➜</span>
          <img
            src="/oneway-icon.png"
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black tracking-tight text-purple-700">{t('ow_bannerTitle')}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)' }}>
              {t('ow_bannerPrice')}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{t('ow_bannerSub')}</p>
        </div>

        <span className="flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 ring-1 ring-purple-200 group-hover:bg-purple-100">
          {t('ow_bannerCta')} <span className="transition-transform group-hover:translate-x-0.5">›</span>
        </span>
      </div>
    </button>
    </>
  );
}
