'use client';
/**
 * OwnerCalendar — ニコニコレンタカー風の予約カレンダー
 * 縦軸: 車両、横軸: 日付、予約ブロックを色分け表示
 */
import { useState, useMemo } from 'react';
import { useI18n } from '../lib/i18nContext';

const STATUS_COLOR = {
  confirmed:   { bg: '#16a34a', text: '#fff', key: 'oc_stConfirmed' },
  pending:     { bg: '#d97706', text: '#fff', key: 'oc_stPending' },
  in_progress: { bg: '#2563eb', text: '#fff', key: 'oc_stInProgress' },
  completed:   { bg: '#6b7280', text: '#fff', key: 'oc_stCompleted' },
  cancelled:   { bg: '#374151', text: '#9ca3af', key: 'oc_stCancelled' },
};

function getDays(year, month) {
  const days = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function toDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export default function OwnerCalendar({ vehicles = [], reservations = [] }) {
  const { t, locale } = useI18n();
  const intlLocale = locale || 'ja';
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tooltip, setTooltip] = useState(null);

  const days = useMemo(() => getDays(year, month), [year, month]);
  const monthStart = new Date(year, month, 1);
  const monthEnd   = new Date(year, month + 1, 0);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const monthValue = `${year}-${String(month + 1).padStart(2, '0')}`;
  const handleMonthInput = (e) => {
    const [nextYear, nextMonth] = e.target.value.split('-').map(Number);
    if (!nextYear || !nextMonth) return;
    setYear(nextYear);
    setMonth(nextMonth - 1);
    setTooltip(null);
  };

  const monthLabel = new Intl.DateTimeFormat(intlLocale, { year: 'numeric', month: 'long' })
    .format(new Date(year, month, 1));
  const dowFmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
  const DAY_NAMES = Array.from({ length: 7 }, (_, i) => dowFmt.format(new Date(2024, 0, 7 + i)));

  const COL_W = 36; // px per day
  const ROW_H = 56; // px per vehicle row
  const LABEL_W = 130;

  // 予約ブロックの計算
  const blocks = useMemo(() => {
    return reservations
      .filter(r => r.status !== 'cancelled')
      .map(r => {
        const reservationVehicleId = r.vehicle_id ?? r.vehicleId;
        const start = toDay(r.pickup_at ?? r.pickup);
        const end   = toDay(r.return_at ?? r.ret);
        if (!start || !end) return null;

        // 月内にクリップ
        const clampStart = start < monthStart ? monthStart : start;
        const clampEnd   = end   > monthEnd   ? monthEnd   : end;
        if (clampStart > monthEnd || clampEnd < monthStart) return null;

        const offsetDays  = daysBetween(monthStart, clampStart);
        const durationDays = Math.max(1, daysBetween(clampStart, clampEnd));

        const veh = vehicles.find(v => String(v.id) === String(reservationVehicleId));
        const vIdx = vehicles.findIndex(v => String(v.id) === String(reservationVehicleId));
        if (vIdx < 0) return null;

        const col = STATUS_COLOR[r.status] ?? STATUS_COLOR.pending;

        return {
          id:       r.id,
          vIdx,
          offsetDays,
          durationDays,
          color:    col.bg,
          textColor: col.text,
          labelKey: col.key,
          status:   r.status,
          vehicle:  veh ? `${veh.maker} ${veh.model}` : reservationVehicleId,
          guestName: r.guest_name || r.guestName || t('oc_registeredUser'),
          pickup:   (r.pickup_at ?? r.pickup)?.slice(0, 16),
          ret:      (r.return_at ?? r.ret)?.slice(0, 16),
          total:    r.total,
          days:     r.days,
        };
      })
      .filter(Boolean);
  }, [reservations, vehicles, year, month]);

  const totalW = LABEL_W + COL_W * days.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <h3 className="text-white font-bold text-sm">📅 {t('oc_title')}</h3>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-gray-400 hover:text-white text-lg px-2">‹</button>
          <span className="text-white font-semibold text-sm min-w-24 text-center">
            {monthLabel}
          </span>
          <button onClick={nextMonth} className="text-gray-400 hover:text-white text-lg px-2">›</button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="text-xs text-purple-400 border border-purple-700 rounded-lg px-2 py-1 hover:bg-purple-900/30 ml-2">
            {t('oc_thisMonth')}
          </button>
          <input
            type="month"
            value={monthValue}
            onChange={handleMonthInput}
            className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-purple-500 focus:outline-none"
            style={{ colorScheme: 'dark' }}
          />
        </div>
        {/* 凡例 */}
        <div className="flex items-center gap-3">
          {Object.entries(STATUS_COLOR).filter(([k]) => k !== 'cancelled').map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: v.bg }} />
              <span className="text-gray-400 text-xs">{t(v.key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* カレンダー本体 */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: totalW }}>

          {/* 日付ヘッダー */}
          <div className="flex border-b border-gray-800 bg-gray-900/80 sticky top-0 z-10">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }}
              className="text-gray-500 text-xs font-semibold px-3 py-2 border-r border-gray-800 flex-shrink-0">
              {t('oc_vehicle')}
            </div>
            {days.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              const dow = d.getDay();
              return (
                <div key={i} style={{ width: COL_W, minWidth: COL_W }}
                  className={`flex-shrink-0 flex flex-col items-center justify-center py-1.5 border-r border-gray-800/50 text-xs ${
                    isToday ? 'bg-purple-900/30' : ''
                  } ${dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                  <span className="font-semibold">{d.getDate()}</span>
                  <span className="text-xs opacity-70">{DAY_NAMES[dow]}</span>
                </div>
              );
            })}
          </div>

          {/* 車両行 */}
          {vehicles.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">{t('oc_noVehicles')}</div>
          ) : (
            vehicles.map((v, vIdx) => {
              const vBlocks = blocks.filter(b => b.vIdx === vIdx);
              return (
                <div key={v.id} className="flex border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
                  style={{ height: ROW_H }}>
                  {/* 車両名 */}
                  <div style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="border-r border-gray-800 flex items-center gap-2 px-3 flex-shrink-0">
                    {v.img_url ? (
                      <img src={v.img_url} alt="" className="w-8 h-6 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-6 bg-gray-700 rounded flex items-center justify-center text-sm flex-shrink-0">🚗</div>
                    )}
                    <span className="text-white text-xs font-medium truncate">
                      {v.maker} {v.model}
                    </span>
                  </div>

                  {/* 日付セル（相対位置でブロックを配置） */}
                  <div className="relative flex-1" style={{ height: ROW_H }}>
                    {/* グリッド線 */}
                    {days.map((d, i) => {
                      const isToday = d.toDateString() === today.toDateString();
                      const dow = d.getDay();
                      return (
                        <div key={i} style={{ position: 'absolute', left: i * COL_W, width: COL_W, height: '100%' }}
                          className={`border-r border-gray-800/30 ${isToday ? 'bg-purple-900/10' : ''} ${(dow === 0 || dow === 6) ? 'bg-gray-800/20' : ''}`} />
                      );
                    })}

                    {/* 予約ブロック */}
                    {vBlocks.map(b => (
                      <div
                        key={b.id}
                        style={{
                          position: 'absolute',
                          left: b.offsetDays * COL_W + 2,
                          width: b.durationDays * COL_W - 4,
                          top: 8, height: ROW_H - 16,
                          background: b.color,
                          borderRadius: 6,
                          zIndex: 1,
                          cursor: 'pointer',
                          overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => setTooltip({ ...b, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                        className="flex items-center px-1.5 select-none"
                      >
                        <span className="text-white text-xs font-semibold truncate" style={{ fontSize: 10 }}>
                          {b.id.slice(-4)} {b.guestName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ツールチップ */}
      {tooltip && (
        <div style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10, zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 pointer-events-none min-w-48">
          <p className="text-white font-bold text-sm mb-1">{tooltip.vehicle}</p>
          <p className="text-gray-400 text-xs mb-1">{t('oc_reservationId')}: {tooltip.id}</p>
          <p className="text-gray-400 text-xs">👤 {tooltip.guestName}</p>
          <p className="text-gray-400 text-xs">📅 {tooltip.pickup} → {tooltip.ret}</p>
          <p className="text-gray-400 text-xs">🗓 {tooltip.days}{t('oc_daysUnit')}</p>
          <p className="text-purple-400 text-xs font-bold">¥{(tooltip.total ?? 0).toLocaleString()}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full text-white"
            style={{ background: tooltip.color }}>{t(tooltip.labelKey)}</span>
        </div>
      )}
    </div>
  );
}
