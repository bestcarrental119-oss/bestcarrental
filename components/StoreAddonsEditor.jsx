'use client';
/**
 * StoreAddonsEditor
 * 加盟店オーナーまたは管理者が付加サービスを CRUD するコンポーネント。
 * Props:
 *   ownerId  string | null  — null のときはプラットフォーム共通アドオン編集
 *   theme    object
 */
import { useState, useEffect } from 'react';
import { useI18n } from '../lib/i18nContext';

const ICONS = ['🛡','🛣','👶','↗️','🗺️','🎵','📷','🌐','⛽','🧹','🔧','💺','❄️','🔑','📦'];

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-400">{label}</label>
      {children}
    </div>
  );
}

const inp = 'bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500';

export default function StoreAddonsEditor({ ownerId = null, theme = {} }) {
  const { t } = useI18n();
  const g = theme.primary ? `linear-gradient(135deg,${theme.primary},${theme.accent})` : '#7c3aed';

  const [addons,  setAddons]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [form,    setForm]    = useState(null); // null=非表示, {}=新規, {id,...}=編集

  // ── 一覧取得 ─────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const url = ownerId ? `/api/addons?ownerId=${ownerId}` : '/api/addons';
      const res = await fetch(url);
      const data = await res.json();
      // 自分のアドオンのみ編集可（owner_id が一致 or null=プラットフォーム共通）
      setAddons(Array.isArray(data) ? data : []);
    } catch { setAddons([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [ownerId]);

  // ── 保存（新規 or 更新）─────────────────────────────────
  const save = async () => {
    if (!form?.name || form.price == null) { setError(t('sae_errRequired')); return; }
    setSaving(true); setError('');
    try {
      const isNew = !form.id;
      const url   = isNew ? '/api/addons' : `/api/addons/${form.id}`;
      const method = isNew ? 'POST' : 'PATCH';
      const body = {
        ownerId:    ownerId,
        name:       form.name,
        description:form.description || null,
        icon:       form.icon || '⚙️',
        price:      Number(form.price),
        price_type: form.price_type || 'per_day',
        sort_order: Number(form.sort_order ?? 0),
      };
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('sae_errSave'));
      setForm(null);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // ── 削除 ─────────────────────────────────────────────────
  const remove = async (id) => {
    if (!confirm(t('sae_confirmDelete'))) return;
    await fetch(`/api/addons/${id}`, { method: 'DELETE' });
    await load();
  };

  // ── 表示/非表示トグル ─────────────────────────────────────
  const toggle = async (addon) => {
    await fetch(`/api/addons/${addon.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !addon.is_active }),
    });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-sm">{t('sae_title')}</h3>
        <button
          onClick={() => setForm({ name: '', description: '', icon: '⚙️', price: 0, price_type: 'per_day', sort_order: 0 })}
          className="px-3 py-1.5 rounded-lg text-xs text-white font-semibold"
          style={{ background: g }}
        >
          {t('sae_add')}
        </button>
      </div>

      {/* ── フォーム ── */}
      {form && (
        <div className="bg-gray-800 border border-purple-700/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('sae_serviceName')}>
              <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('sae_serviceNamePh')} />
            </Field>
            <Field label={t('sae_priceYen')}>
              <input className={inp} type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </Field>
            <Field label={t('sae_billingType')}>
              <select className={inp} value={form.price_type} onChange={e => setForm(f => ({ ...f, price_type: e.target.value }))}>
                <option value="per_day">{t('sae_perDay')}</option>
                <option value="flat">{t('sae_flat')}</option>
              </select>
            </Field>
            <Field label={t('sae_icon')}>
              <div className="flex flex-wrap gap-1">
                {ICONS.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, icon: ic }))}
                    className={`w-8 h-8 rounded text-sm transition-all ${form.icon === ic ? 'ring-2 ring-purple-500 bg-gray-700' : 'hover:bg-gray-700'}`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label={t('sae_description')}>
            <input className={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('sae_descriptionPh')} />
          </Field>
          <Field label={t('sae_displayOrder')}>
            <input className={`${inp} w-24`} type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
          </Field>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-xs text-white font-semibold disabled:opacity-50" style={{ background: g }}>
              {saving ? t('mp_saving') : t('mp_save')}
            </button>
            <button onClick={() => { setForm(null); setError(''); }} className="px-4 py-2 rounded-lg text-xs text-gray-400 bg-gray-700 hover:bg-gray-600">
              {t('mp_cancel')}
            </button>
          </div>
        </div>
      )}

      {/* ── 一覧 ── */}
      {loading ? (
        <p className="text-gray-500 text-sm text-center py-4">{t('mp_loading')}</p>
      ) : addons.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('sae_empty')}</p>
      ) : (
        <div className="space-y-2">
          {addons.map(a => (
            <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${a.is_active ? 'border-gray-700 bg-gray-800/60' : 'border-gray-800 bg-gray-900/40 opacity-50'}`}>
              <span className="text-lg flex-shrink-0">{a.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{a.name}</div>
                <div className="text-gray-400 text-xs">
                  ¥{a.price.toLocaleString()} / {a.price_type === 'per_day' ? t('sae_perDayUnit') : t('sae_flatUnit')}
                  {a.description && <span className="ml-2 text-gray-600">· {a.description}</span>}
                  {!a.owner_id && <span className="ml-2 text-purple-400 text-xs">{t('sae_common')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* 表示/非表示 */}
                <button
                  onClick={() => toggle(a)}
                  className={`text-xs px-2 py-1 rounded ${a.is_active ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-500'}`}
                >
                  {a.is_active ? t('sae_visible') : t('sae_hidden')}
                </button>
                {/* 編集（自店舗のみ） */}
                {(a.owner_id === ownerId || (!a.owner_id && !ownerId) || ownerId) && (
                  <>
                    <button onClick={() => setForm({ ...a })} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600">
                      {t('od_edit')}
                    </button>
                    <button onClick={() => remove(a.id)} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50">
                      {t('od_delete')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
