'use client';
import { useMemo, useState } from 'react';
import { Modal, GradBtn, Input } from '../Shared';
import { useApp } from '../../lib/context';
import { useI18n } from '../../lib/i18nContext';
import { INSURANCE_PLANS, PAID_PLAN_IDS } from '../../lib/insurance';
import { haversineKm, recommendedBasePrice, recommendedDeadlineISO } from '../../lib/oneWay';

const toLocalInput = (iso) => {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

/**
 * 乗り捨て検知時のレコメンド → プレフィル公開フォーム。
 * props.recommend = { vehicle:{id,maker,model,cls,img}, from:{name,lat,lng}, to:{name,lat,lng}, ownerId, ownerAuthId }
 */
export default function AdminRecommendPublish({ recommend, onClose, onPublished }) {
  const { state, dispatch } = useApp();
  const { theme } = state;
  const { t } = useI18n();
  const v = recommend?.vehicle ?? {};
  const from = recommend?.from ?? {};
  const to = recommend?.to ?? {};

  const distanceKm = useMemo(() => haversineKm(from.lat, from.lng, to.lat, to.lng), [from, to]);

  const [phase, setPhase] = useState('ask'); // ask | form
  const [basePrice, setBasePrice] = useState(() => String(recommendedBasePrice(v.cls, distanceKm)));
  const [deadline, setDeadline] = useState(() => toLocalInput(recommendedDeadlineISO(distanceKm)));
  const [plans, setPlans] = useState([...PAID_PLAN_IDS]);
  const [busy, setBusy] = useState(false);

  const togglePlan = (id) =>
    setPlans(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const publish = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/one-way/listings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: recommend?.ownerId ?? null,
          ownerAuthId: recommend?.ownerAuthId ?? null,
          vehicleId: v.id ?? null,
          maker: v.maker, model: v.model, cls: v.cls, img: v.img ?? v.img_url,
          from, to, distanceKm,
          basePrice: Number(basePrice) || 0,
          deadlineAt: deadline ? new Date(deadline).toISOString() : recommendedDeadlineISO(distanceKm),
          availableFrom: new Date().toISOString(),
          insurancePlans: plans,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      dispatch({ type: 'TOAST', msg: t('ow_published') });
      onPublished?.(data.listing);
      onClose();
    } catch (e) {
      dispatch({ type: 'TOAST', msg: e.message });
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose}>
      <div className="p-5">
        {phase === 'ask' ? (
          <div className="text-center">
            <div className="mb-3 text-4xl">🚗↩️</div>
            <h3 className="mb-2 text-lg font-bold text-white">{t('ow_recTitle')}</h3>
            <p className="mx-auto mb-5 max-w-sm text-sm leading-relaxed text-gray-300">
              {t('ow_recBody').replace('{to}', to.name ?? '').replace('{from}', from.name ?? '')}
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-semibold text-gray-200">
                {t('ow_recLater')}
              </button>
              <GradBtn theme={theme} onClick={() => setPhase('form')} className="flex-1 py-3 text-sm font-bold">
                {t('ow_recPublishFlow')} →
              </GradBtn>
            </div>
          </div>
        ) : (
          <>
            <h3 className="mb-1 text-lg font-bold text-white">📣 {t('ow_pubTitle')}</h3>
            <p className="mb-4 rounded-lg bg-purple-500/10 p-2 text-[11px] text-purple-200">✨ {t('ow_pubPrefillNote')}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-400">{t('ow_pubFrom')}</label>
                <div className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-white">{from.name}</div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">{t('ow_pubTo')}</label>
                <div className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-white">{to.name}</div>
              </div>
            </div>

            <div className="mt-2 rounded-lg bg-gray-800/40 px-3 py-2 text-xs text-gray-400">
              {t('ow_pubDistance')}: <span className="font-bold text-white">{distanceKm} km</span> · {v.maker} {v.model}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  {t('ow_pubBasePrice')} <span className="text-purple-300">({t('ow_pubRecommended')})</span>
                </label>
                <input type="number" min={0} value={basePrice} onChange={e => setBasePrice(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  {t('ow_pubDeadline')} <span className="text-purple-300">({t('ow_pubRecommended')})</span>
                </label>
                <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white" />
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-xs text-gray-400">{t('ow_pubPlans')}</label>
              <div className="flex flex-wrap gap-2">
                {INSURANCE_PLANS.filter(p => p.id !== 'basic').map(p => {
                  const on = plans.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => togglePlan(p.id)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${on ? 'border-transparent text-white' : 'border-gray-700 bg-gray-800/40 text-gray-300'}`}
                      style={on ? { boxShadow: `0 0 0 2px ${p.accent}`, background: 'rgba(255,255,255,0.04)' } : {}}>
                      {on ? '✓ ' : ''}{t(`ins_${p.id}_name`)} · ¥{p.price.toLocaleString()}
                    </button>
                  );
                })}
              </div>
            </div>

            <GradBtn theme={theme} onClick={publish} disabled={busy} className="mt-5 w-full py-3.5 text-base font-bold">
              {busy ? t('ow_pubPublishing') : `📣 ${t('ow_pubPublish')}`}
            </GradBtn>
          </>
        )}
      </div>
    </Modal>
  );
}
