'use client';
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../lib/context';
import { useI18n } from '../lib/i18nContext';

const STARS = ['', '★', '★★', '★★★', '★★★★', '★★★★★'];

function StarBadge({ rating }) {
  const color =
    rating >= 4 ? 'text-green-400 bg-green-400/10' :
    rating === 3 ? 'text-yellow-400 bg-yellow-400/10' :
                   'text-red-400 bg-red-400/10';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${color}`}>
      ★ {rating}
    </span>
  );
}

function StatusBadge({ review }) {
  const { t } = useI18n();
  if (review.is_hidden)
    return <span className="px-2 py-0.5 rounded-lg text-xs bg-red-500/15 text-red-400">{t('ar_stHidden')}</span>;
  if (review.reported)
    return <span className="px-2 py-0.5 rounded-lg text-xs bg-orange-500/15 text-orange-400">{t('ar_stReported')}</span>;
  if (review.is_auto)
    return <span className="px-2 py-0.5 rounded-lg text-xs bg-gray-700 text-gray-400">{t('ar_stAuto')}</span>;
  return <span className="px-2 py-0.5 rounded-lg text-xs bg-green-500/10 text-green-400">{t('ar_stPublic')}</span>;
}

// ── 編集モーダル ──────────────────────────────────────────────
function EditModal({ review, onSave, onClose, theme }) {
  const { t } = useI18n();
  const [comment, setComment] = useState(review.comment ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(review.id, { comment });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-lg">
        <h3 className="text-white font-bold mb-4">{t('ar_editComment')}</h3>
        {review.original_comment && (
          <div className="mb-3 p-3 bg-gray-800 rounded-xl text-xs text-gray-500">
            <p className="font-semibold mb-1">{t('ar_originalComment')}</p>
            <p>{review.original_comment}</p>
          </div>
        )}
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm
                     focus:outline-none focus:border-purple-500 resize-none"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
          >
            {saving ? t('ar_saving') : t('ar_save')}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-gray-400 border border-gray-700 text-sm">
            {t('ar_cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 報告確認モーダル（加盟店用）─────────────────────────────
function ReportModal({ review, onReport, onClose, theme }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!reason.trim()) return;
    setSending(true);
    await onReport(review.id, reason);
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-lg">
        <h3 className="text-white font-bold mb-1">{t('ar_reportTitle')}</h3>
        <p className="text-gray-400 text-sm mb-4">{t('ar_reportDesc')}</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder={t('ar_reportPh')}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm
                     focus:outline-none focus:border-orange-500 resize-none placeholder-gray-600"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={send}
            disabled={sending || !reason.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {sending ? t('ar_sending') : t('ar_sendReport')}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-gray-400 border border-gray-700 text-sm">
            {t('ar_cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────
export default function AdminReviews() {
  const { t } = useI18n();
  const { state } = useApp();
  const { currentUser, theme } = state;

  const isAdmin = currentUser?.role === 'admin';

  const [reviews, setReviews]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [storeFilter, setStoreFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all'); // all | 1-5 | reported
  const [sortKey, setSortKey]     = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [editTarget, setEditTarget]   = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── データ取得 ──────────────────────────────────────────────
  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: sortKey, order: sortOrder });
      if (storeFilter) params.set('store', storeFilter);

      const res = await fetch(`/api/admin/reviews?${params}`, {
        headers: { 'x-user-role': currentUser?.role ?? '' },
      });
      const data = await res.json();
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [sortKey, sortOrder, storeFilter, currentUser]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  // ── フィルター適用 ──────────────────────────────────────────
  const filtered = reviews.filter(r => {
    if (ratingFilter === 'reported') return r.reported;
    if (ratingFilter !== 'all') return r.rating === Number(ratingFilter);
    return true;
  });

  // ── 管理者アクション ────────────────────────────────────────
  const handleEdit = async (id, updates) => {
    await fetch('/api/admin/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'admin' },
      body: JSON.stringify({ id, ...updates, moderatedBy: currentUser?.id }),
    });
    showToast(t('ar_tEdited'));
    fetchReviews();
  };

  const handleHide = async (review) => {
    const confirm = window.confirm(t('ar_confirmHide'));
    if (!confirm) return;
    await fetch('/api/admin/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'admin' },
      body: JSON.stringify({
        id: review.id,
        isHidden: !review.is_hidden,
        hiddenReason: t('ar_hiddenByAdmin'),
        moderatedBy: currentUser?.id,
      }),
    });
    showToast(review.is_hidden ? t('ar_tShown') : t('ar_tHidden'));
    fetchReviews();
  };

  const handleDelete = async (id) => {
    const confirm = window.confirm(t('ar_confirmDelete'));
    if (!confirm) return;
    await fetch('/api/admin/reviews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'admin' },
      body: JSON.stringify({ id }),
    });
    showToast(t('ar_tDeleted'));
    fetchReviews();
  };

  // ── オーナーアクション ──────────────────────────────────────
  const handleReport = async (reviewId, reason) => {
    await fetch('/api/reviews/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId, reportReason: reason, reportedBy: currentUser?.id }),
    });
    showToast(t('ar_tReported'));
    fetchReviews();
  };

  const sortIcon = (key) => sortKey === key ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="p-6">
      {/* トースト */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg border border-gray-700">
          {toast}
        </div>
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <EditModal
          review={editTarget}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
          theme={theme}
        />
      )}

      {/* 報告モーダル */}
      {reportTarget && (
        <ReportModal
          review={reportTarget}
          onReport={handleReport}
          onClose={() => setReportTarget(null)}
          theme={theme}
        />
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">{t('ar_title')}</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {isAdmin ? t('ar_subAdmin') : t('ar_subOwner')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{filtered.length} {t('ar_countUnit')}</span>
          <button
            onClick={fetchReviews}
            className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-xl px-3 py-1.5 transition-colors"
          >
            {t('ar_refresh')}
          </button>
        </div>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          value={storeFilter}
          onChange={e => setStoreFilter(e.target.value)}
          placeholder={t('ar_filterStore')}
          className="bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2 text-sm
                     focus:outline-none focus:border-purple-500 placeholder-gray-600 w-56"
        />
        <select
          value={ratingFilter}
          onChange={e => setRatingFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
        >
          <option value="all">{t('ar_allRatings')}</option>
          <option value="1">{t('arx_star1')}</option>
          <option value="2">★2</option>
          <option value="3">★3</option>
          <option value="4">★4</option>
          <option value="5">{t('arx_star5')}</option>
          <option value="reported">{t('ar_reportedOpt')}</option>
        </select>
        <button
          onClick={() => { setSortKey('rating'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); fetchReviews(); }}
          className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
            sortKey === 'rating' ? 'border-purple-500 text-purple-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          {t('ar_sortRating')}{sortIcon('rating')}
        </button>
        <button
          onClick={() => { setSortKey('created_at'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); fetchReviews(); }}
          className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
            sortKey === 'created_at' ? 'border-purple-500 text-purple-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
          }`}
        >
          {t('ar_sortDate')}{sortIcon('created_at')}
        </button>
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">{t('ar_loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-600">{t('ar_notFound')}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thStore')}</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thRating')}</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thComment')}</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thType')}</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thStatus')}</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thDate')}</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wider">{t('ar_thAction')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const vehicle = r.reservations?.vehicles;
                const loc     = vehicle?.loc ?? '—';
                const carName = vehicle ? `${vehicle.maker} ${vehicle.model}` : '—';

                return (
                  <tr
                    key={r.id}
                    className={`border-b border-gray-800/50 transition-colors hover:bg-gray-800/30 ${
                      r.is_hidden ? 'opacity-50' : ''
                    } ${r.reported && !r.is_hidden ? 'bg-orange-900/10' : ''}`}
                  >
                    {/* 店舗 */}
                    <td className="px-4 py-3">
                      <p className="text-white font-medium truncate max-w-[140px]">{loc}</p>
                      <p className="text-gray-500 text-xs truncate max-w-[140px]">{carName}</p>
                    </td>

                    {/* 評価 */}
                    <td className="px-4 py-3">
                      <StarBadge rating={r.rating} />
                    </td>

                    {/* コメント */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">
                        {r.comment || <span className="text-gray-600 italic">{t('ar_noComment')}</span>}
                      </p>
                      {r.reported && (
                        <p className="text-orange-400 text-xs mt-1">⚠ {r.report_reason}</p>
                      )}
                    </td>

                    {/* 種別 */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">
                        {r.reviewer_role === 'customer' ? t('arx_custToStore') : t('arx_storeToCust')}
                      </span>
                    </td>

                    {/* ステータス */}
                    <td className="px-4 py-3">
                      <StatusBadge review={r} />
                    </td>

                    {/* 日時 */}
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString('ja-JP')}
                    </td>

                    {/* アクション */}
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        // ── 管理者：編集・非表示・削除 ──
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEditTarget(r)}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:border-purple-500 hover:text-purple-400 transition-colors"
                          >
                            {t('ar_edit')}
                          </button>
                          <button
                            onClick={() => handleHide(r)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                              r.is_hidden
                                ? 'border-green-700 text-green-400 hover:border-green-500'
                                : 'border-gray-700 text-gray-300 hover:border-yellow-500 hover:text-yellow-400'
                            }`}
                          >
                            {r.is_hidden ? t('ar_show') : t('ar_hide')}
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:border-red-500 hover:text-red-400 transition-colors"
                          >
                            {t('ar_delete')}
                          </button>
                        </div>
                      ) : (
                        // ── オーナー：報告のみ ──
                        <button
                          onClick={() => setReportTarget(r)}
                          disabled={r.reported}
                          className="px-2.5 py-1.5 rounded-lg text-xs border border-orange-700/50 text-orange-400 hover:border-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {r.reported ? t('ar_reported') : t('ar_report')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 権限説明フッター */}
      <div className="mt-4 p-3 rounded-xl bg-gray-800/30 border border-gray-800">
        <p className="text-xs text-gray-600">
          {isAdmin
            ? t('ar_footAdmin')
            : t('ar_footOwner')}
        </p>
      </div>
    </div>
  );
}
