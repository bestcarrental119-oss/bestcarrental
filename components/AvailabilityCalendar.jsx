'use client';
/**
 * AvailabilityCalendar — 車両の空き状況カレンダー
 * 予約済み日はグレー表示、選択中の日程はパープル
 */
import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../lib/i18nContext';

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function isInRange(date, from, to) {
  return from && to && date >= from && date <= to;
}

function isBooked(date, bookedRanges) {
  const d = date.toISOString().slice(0, 10);
  return bookedRanges.some(r => d >= r.from && d < r.to);
}

export default function AvailabilityCalendar({ vehicleId, onSelect, theme }) {
  const { t, locale } = useI18n();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ロケールに応じた曜日・月ラベル（Intl でローカライズ）
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + i)));

  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth() + 1);
  const [bookedRanges, setBookedRanges] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [selectStart,  setSelectStart]  = useState(null);
  const [selectEnd,    setSelectEnd]    = useState(null);
  const [hovering,     setHovering]     = useState(null);

  const primary = theme?.primary ?? '#7c3aed';

  // 空き状況を取得
  const fetchAvail = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/vehicle-availability?vehicleId=${vehicleId}&year=${year}&month=${month}`);
      const data = await res.json();
      setBookedRanges(data.bookedRanges ?? []);
    } catch { setBookedRanges([]); }
    finally { setLoading(false); }
  }, [vehicleId, year, month]);

  useEffect(() => { fetchAvail(); }, [fetchAvail]);

  // 月のカレンダーデータを生成
  const firstDay  = new Date(year, month - 1, 1).getDay();
  const daysCount = new Date(year, month, 0).getDate();

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;
  const handleMonthInput = (e) => {
    const [nextYear, nextMonth] = e.target.value.split('-').map(Number);
    if (!nextYear || !nextMonth) return;
    setYear(nextYear);
    setMonth(nextMonth);
    setSelectStart(null);
    setSelectEnd(null);
  };

  const handleDayClick = (d) => {
    if (d < today) return;
    if (isBooked(d, bookedRanges)) return;

    if (!selectStart || (selectStart && selectEnd)) {
      setSelectStart(d);
      setSelectEnd(null);
    } else {
      if (d < selectStart) {
        setSelectStart(d);
        setSelectEnd(null);
      } else {
        // 選択範囲内に予約済み日がないか確認
        let hasConflict = false;
        const cur = new Date(selectStart);
        while (cur <= d) {
          if (isBooked(cur, bookedRanges)) { hasConflict = true; break; }
          cur.setDate(cur.getDate() + 1);
        }
        if (hasConflict) {
          setSelectStart(d);
          setSelectEnd(null);
          return;
        }
        setSelectEnd(d);
        // 注: ここでは自動確定せず、ユーザーが「確認」ボタンを押したときに確定する
      }
    }
  };

  const fmtDateTime = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}T10:00`;
  };

  const confirmSelection = () => {
    if (!selectStart || !selectEnd || !onSelect) return;
    onSelect({ pickup: fmtDateTime(selectStart), ret: fmtDateTime(selectEnd) });
  };

  const clearSelection = () => {
    setSelectStart(null);
    setSelectEnd(null);
    setHovering(null);
  };

  const endDate = selectEnd ?? hovering;

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysCount; d++) {
    days.push(new Date(year, month - 1, d));
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 select-none">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-800">‹</button>
        <div className="text-white font-semibold text-sm">
          {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1))}
          {loading && <span className="ml-2 text-purple-400 text-xs">{t('ac_loading')}</span>}
        </div>
        <button onClick={nextMonth} className="text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-800">›</button>
      </div>
      <input
        type="month"
        value={monthValue}
        onChange={handleMonthInput}
        className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 focus:border-purple-500 focus:outline-none"
        style={{ colorScheme: 'dark' }}
      />

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d, i) => (
          <div key={i} className={`text-center text-xs font-semibold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;

          const past    = d < today;
          const booked  = isBooked(d, bookedRanges);
          const isStart = selectStart && isSameDay(d, selectStart);
          const isEnd   = selectEnd   && isSameDay(d, selectEnd);
          const inRange = selectStart && endDate && isInRange(d, selectStart, endDate) && !isStart && !isEnd;
          const isToday = isSameDay(d, today);
          const dow     = d.getDay();

          let cellClass = 'relative flex items-center justify-center h-9 rounded-lg text-sm transition-all ';
          let style = {};

          if (past || booked) {
            cellClass += 'text-gray-700 cursor-not-allowed ';
            if (booked) cellClass += 'bg-red-900/20 line-through ';
          } else if (isStart || isEnd) {
            cellClass += 'text-white font-bold cursor-pointer ';
            style = { background: primary };
          } else if (inRange) {
            cellClass += 'text-white cursor-pointer ';
            style = { background: primary + '33' };
          } else {
            cellClass += 'cursor-pointer hover:bg-gray-800 ';
            if (isToday) cellClass += 'ring-1 ring-purple-500 font-bold ';
            if (dow === 0) cellClass += 'text-red-400 ';
            else if (dow === 6) cellClass += 'text-blue-400 ';
            else cellClass += 'text-white ';
          }

          return (
            <div
              key={d.toISOString()}
              className={cellClass}
              style={style}
              onClick={() => handleDayClick(d)}
              onMouseEnter={() => { if (selectStart && !selectEnd) setHovering(d); }}
              onMouseLeave={() => setHovering(null)}
            >
              {d.getDate()}
              {booked && (
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500" />
              )}
            </div>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: primary }} />
          <span className="text-gray-400 text-xs">{t('ac_selecting')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-900/40" />
          <span className="text-gray-400 text-xs">{t('ac_booked')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-700" />
          <span className="text-gray-400 text-xs">{t('ac_past')}</span>
        </div>
      </div>

      {/* 選択状態 */}
      {selectStart && (
        <div className="mt-2 text-xs text-center" style={{ color: primary }}>
          {selectStart.toLocaleDateString(locale)}
          {selectEnd ? ` → ${selectEnd.toLocaleDateString(locale)} (${t('ac_nights').replace('{n}', Math.round((selectEnd - selectStart) / 86400000))})` : ` → ${t('ac_selectReturn')}`}
        </div>
      )}

      {/* 確認ボタン — 開始日と返却日が選択されたら表示 */}
      {selectStart && selectEnd && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={clearSelection}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            {t('ac_clear')}
          </button>
          <button
            type="button"
            onClick={confirmSelection}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 active:scale-[0.99] transition-all"
            style={{ background: primary }}
          >
            {t('ac_confirm')}
          </button>
        </div>
      )}
    </div>
  );
}
