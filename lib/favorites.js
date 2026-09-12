'use client';
import { useCallback, useEffect, useState } from 'react';

/**
 * Favorites & recently-viewed vehicles, persisted in localStorage so they
 * survive reloads and work offline. A tiny pub/sub keeps every card in sync
 * the instant a heart is toggled anywhere in the app.
 */
const FAV_KEY = 'bcr:favorites';
const RECENT_KEY = 'bcr:recent';
const EVT = 'bcr:store-changed';

const read = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
};

export function getFavorites() { return read(FAV_KEY); }
export function isFavorite(id) { return read(FAV_KEY).includes(String(id)); }
export function toggleFavorite(id) {
  id = String(id);
  const f = read(FAV_KEY);
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.unshift(id);
  write(FAV_KEY, f.slice(0, 200));
  return i < 0; // true if now favorited
}

export function getRecentlyViewed() { return read(RECENT_KEY); }
export function addRecentlyViewed(id) {
  if (id == null) return;
  id = String(id);
  const r = read(RECENT_KEY).filter(x => x !== id);
  r.unshift(id);
  write(RECENT_KEY, r.slice(0, 30));
}

/** React hook — live favorites & recent id lists that update across the app. */
export function useFavorites() {
  const [fav, setFav] = useState([]);
  const [recent, setRecent] = useState([]);
  const refresh = useCallback(() => { setFav(getFavorites()); setRecent(getRecentlyViewed()); }, []);
  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener(EVT, h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
  }, [refresh]);
  return { fav, recent, refresh };
}
