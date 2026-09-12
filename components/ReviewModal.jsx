'use client';
/**
 * ReviewModal — Airbnb-style double-blind review form
 *
 * Props:
 *   reservation  — the reservation object
 *   vehicle      — the vehicle object
 *   currentUser  — logged-in user
 *   theme        — app theme
 *   onClose()    — close callback
 *   onSubmit()   — called after successful submit
 */
import { useState } from 'react';
import { Modal, GradBtn, grad } from './Shared';

const PROMPTS = [
  'Cleanliness', 'Accuracy', 'Communication', 'Value',
];

export default function ReviewModal({ reservation, vehicle, currentUser, theme, onClose, onSubmit, role = 'customer', revieweeId = null, title, subtitle }) {
  const [rating,  setRating]  = useState(0);
  const [hover,   setHover]   = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);

  const g = grad(theme);

  const submit = async () => {
    if (rating === 0) { setError('Please select a star rating.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/reviews', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: reservation.id,
          reviewerId:    currentUser?.id ?? null,
          revieweeId:    revieweeId ?? reservation.userId ?? reservation.user_id ?? null,
          reviewerRole:  role,
          rating,
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit review');
      setDone(true);
      onSubmit?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const starLabel = ['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent'][rating] || '';

  return (
    <Modal open onClose={onClose}>
      <div className="p-6">
        {done ? (
          /* ── Success state ──────────────────────────────────── */
          <div className="text-center py-6">
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="text-white text-xl font-bold mb-2">Review Submitted!</h3>
            <p className="text-gray-400 text-sm mb-2">
              Your review will be visible once the host also reviews, or after 14 days.
            </p>
            <p className="text-gray-500 text-xs mb-6">
              This keeps both sides honest — no retaliation reviews.
            </p>
            <GradBtn theme={theme} onClick={onClose} className="px-8 py-2.5 text-sm">
              Close
            </GradBtn>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              {vehicle?.img && (
                <img src={vehicle.img} alt="" className="w-14 h-12 object-cover rounded-xl flex-shrink-0" />
              )}
              <div>
                <h3 className="text-white font-bold text-lg">Rate your experience</h3>
                <p className="text-gray-400 text-xs">
                  {vehicle ? `${vehicle.maker} ${vehicle.model}` : 'Vehicle'} · {reservation.id}
                </p>
              </div>
            </div>

            {/* Double-blind notice */}
            <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 mb-5 flex gap-3">
              <span className="text-purple-400 text-lg flex-shrink-0">🔒</span>
              <p className="text-purple-300 text-xs leading-relaxed">
                <strong>Double-blind review:</strong> Your review stays hidden until the host also submits theirs,
                or 14 days pass. This prevents retaliation reviews.
              </p>
            </div>

            {/* Star rating */}
            <div className="mb-5">
              <label className="block text-gray-400 text-xs mb-3">Overall Rating</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(0)}
                    className="text-3xl transition-transform hover:scale-110 focus:outline-none"
                  >
                    <span style={{
                      color: s <= (hover || rating) ? '#F59E0B' : '#374151',
                      filter: s <= (hover || rating) ? 'drop-shadow(0 0 6px #F59E0B80)' : 'none',
                      transition: 'color 0.15s, filter 0.15s',
                    }}>★</span>
                  </button>
                ))}
                {(hover || rating) > 0 && (
                  <span className="text-amber-400 text-sm font-semibold ml-2">
                    {starLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Quick tags */}
            {rating >= 4 && (
              <div className="mb-4">
                <label className="block text-gray-400 text-xs mb-2">What stood out?</label>
                <div className="flex flex-wrap gap-2">
                  {PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => setComment(c => c.includes(p) ? c.replace(` [${p}]`, '') : c + ` [${p}]`)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        comment.includes(p)
                          ? 'text-white border-transparent'
                          : 'border-gray-700 text-gray-400 hover:border-purple-600'
                      }`}
                      style={comment.includes(p) ? { background: g } : {}}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comment */}
            <div className="mb-5">
              <label className="block text-gray-400 text-xs mb-2">Your Review</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Share your experience with this vehicle and service…"
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-purple-500 placeholder-gray-600"
              />
              <p className="text-gray-600 text-xs mt-1 text-right">{comment.length}/500</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-red-300 text-sm">
                ❌ {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
              <GradBtn
                theme={theme}
                onClick={submit}
                disabled={loading || rating === 0}
                className="flex-1 py-2.5 text-sm"
              >
                {loading ? 'Submitting…' : 'Submit Review ★'}
              </GradBtn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
