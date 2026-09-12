'use client';
import { useEffect, useState } from 'react';
import { Modal, GradBtn, grad } from '../Shared';
import { useApp } from '../../lib/context';
import { useI18n } from '../../lib/i18nContext';
import { ONE_WAY_STORES } from '../../lib/oneWay';
import { geocodeAddress, hasGoogleMapsKey } from '../../lib/googleMaps';
import AdminRecommendPublish from './AdminRecommendPublish';

/**
 * オーナー向けの手動出品ランチャー。
 * 出発地・返却地は「店舗プリセット」または「任意の住所（自動でジオコーディング）」で指定できる。
 * 実運用では乗り捨て検知をトリガーに AdminRecommendPublish を自動起動する想定。
 */
export default function OneWayPublishLauncher({ vehicles = [], ownerId, ownerAuthId }) {
  const { state } = useApp();
  const { theme } = state;
  const { t } = useI18n();
  const g = grad(theme);

  const [pickOpen, setPickOpen] = useState(false);
  const [vehId, setVehId] = useState('');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromCoords, setFromCoords] = useState(null); // {lat,lng} 確定済みなら再ジオコーディング不要
  const [toCoords, setToCoords] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recommend, setRecommend] = useState(null);
  const [ownerLocs, setOwnerLocs] = useState([]);

  // 出品モーダルを開いたらオーナーの保存済み拠点を読み込む
  useEffect(() => {
    if (!pickOpen) return;
    const qs = new URLSearchParams();
    if (ownerId) qs.set('ownerId', ownerId);
    if (ownerAuthId) qs.set('ownerAuthId', ownerAuthId);
    if (![...qs].length) return;
    fetch(`/api/owner/locations?${qs.toString()}`)
      .then(r => r.json()).then(d => setOwnerLocs(d.locations ?? [])).catch(() => {});
  }, [pickOpen, ownerId, ownerAuthId]);

  const onVehicle = (id) => {
    setVehId(id);
    const v = vehicles.find(x => String(x.id) === String(id));
    // 出発地は車両の登録地を初期値に
    if (v?.loc) setFromText(v.loc);
    if (v?.lat && v?.lng) setFromCoords({ lat: +v.lat, lng: +v.lng }); else setFromCoords(null);
  };

  const pickPlace = (side, name, lat, lng) => {
    const coords = (lat != null && lng != null) ? { lat: +lat, lng: +lng } : null;
    if (side === 'from') { setFromText(name); setFromCoords(coords); }
    else { setToText(name); setToCoords(coords); }
  };

  // 住所テキスト→座標。プリセット名/確定済み座標があればそれを使う。
  const resolveSide = async (text, coords) => {
    const name = (text || '').trim();
    if (!name) throw new Error(t('ow_geocodeFail'));
    if (coords) return { name, lat: coords.lat, lng: coords.lng };
    const preset = ONE_WAY_STORES.find(s => s.name === name);
    if (preset) return { name: preset.name, lat: preset.lat, lng: preset.lng };
    const geo = await geocodeAddress(name);
    if (!geo) throw new Error(t('ow_geocodeFail'));
    return { name, lat: geo.lat, lng: geo.lng };
  };

  const next = async () => {
    setErr('');
    const v = vehicles.find(x => String(x.id) === String(vehId));
    if (!v) { setErr('—'); return; }
    setBusy(true);
    try {
      const from = await resolveSide(fromText, fromCoords);
      const to = await resolveSide(toText, toCoords);
      if (from.name === to.name) { setErr(t('ow_geocodeFail')); return; }
      setRecommend({
        vehicle: { id: v.id, maker: v.maker, model: v.model, cls: v.cls, img: v.img ?? v.img_url },
        from, to, ownerId, ownerAuthId,
      });
      setPickOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ※ コンポーネントではなく関数として呼び出す（入力のフォーカス喪失を防ぐ）
  const addrField = (label, value, onChange, side) => (
    <div>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('ow_addressHint')}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
      />
      {ownerLocs.length > 0 && (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          <span className="flex-shrink-0 py-1 text-[10px] text-amber-400/80">🏠 {t('ow_myLocations')}:</span>
          {ownerLocs.map(loc => (
            <button key={loc.id} type="button"
              onClick={() => pickPlace(side, loc.label || loc.address, loc.lat, loc.lng)}
              className="flex-shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100 hover:border-amber-400">
              {loc.label || loc.address}
            </button>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
        <span className="flex-shrink-0 py-1 text-[10px] text-gray-500">{t('ow_useStore')}:</span>
        {ONE_WAY_STORES.map(s => (
          <button key={s.id} type="button" onClick={() => pickPlace(side, s.name, s.lat, s.lng)}
            className="flex-shrink-0 rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-[11px] text-gray-200 hover:border-purple-400">
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setPickOpen(true)}
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 active:scale-95">
        🚗↩️ Best Match
      </button>

      {pickOpen && (
        <Modal open onClose={() => setPickOpen(false)}>
          <div className="p-5">
            <h3 className="mb-4 text-lg font-bold text-white">🚗↩️ {t('ow_pubTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-gray-400">{t('ow_vehicleSelect')}</label>
                <select value={vehId} onChange={e => onVehicle(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white">
                  <option value="">—</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.maker} {v.model}</option>)}
                </select>
              </div>

              {addrField(t('ow_pubFrom'), fromText, val => { setFromText(val); setFromCoords(null); }, 'from')}
              {addrField(t('ow_pubTo'), toText, val => { setToText(val); setToCoords(null); }, 'to')}

              {!hasGoogleMapsKey() && (
                <p className="text-[11px] text-amber-300/80">⚠️ {t('ow_mapUnavailable')}</p>
              )}
              {err && <p className="text-xs text-red-400">❌ {err}</p>}
            </div>

            <GradBtn theme={theme} onClick={next} disabled={busy || !vehId || !fromText.trim() || !toText.trim()}
              className="mt-5 w-full py-3 text-sm font-bold">
              {busy ? t('ow_geocoding') : `${t('ow_recPublishFlow')} →`}
            </GradBtn>
          </div>
        </Modal>
      )}

      {recommend && (
        <AdminRecommendPublish
          recommend={recommend}
          onClose={() => setRecommend(null)}
          onPublished={() => setRecommend(null)}
        />
      )}
    </>
  );
}
