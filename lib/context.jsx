'use client';
import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import {
  INIT_THEME, INIT_VEHICLES, INIT_PARKING,
  INIT_RESERVATIONS, INIT_USERS, INIT_HERO_BANNERS, INIT_LEGAL_PAGES,
} from './data';
import { supabase } from './supabase';
import { t as tFn } from './i18n';
import { isMasterUser } from './master';

function currentLocale() {
  if (typeof window === 'undefined') return 'en';
  try { return window.localStorage.getItem('bcr_locale') || 'en'; } catch { return 'en'; }
}

function userFromSupabase(user) {
  if (!user) return null;
  const bookingProfile = user.user_metadata?.bookingProfile ?? {};
  const master = isMasterUser(user);
  return {
    id:    user.id,
    name:  user.user_metadata?.name || user.email || 'User',
    email: user.email || '',
    // Master accounts act as full admins everywhere (all admin UI + headers),
    // while `isMaster` additionally unlocks the master-only console.
    role:  master
      ? 'admin'
      : (user.user_metadata?.role || user.app_metadata?.role || 'user'),
    isMaster: master,
    phone: user.user_metadata?.phone || bookingProfile.phone || '',
    nat: user.user_metadata?.nat || bookingProfile.nat || '',
    license: user.user_metadata?.license || bookingProfile.license || '',
    idpExpiresOn: bookingProfile.idpExpiresOn || '',
    idpFileName: bookingProfile.idpFileName || '',
    bookingProfile,
  };
}

// ── Initial state ────────────────────────────────────────────────────────────
const initialState = {
  mode:         'frontend',
  adminTab:     'dashboard',
  frontendPage: 'home',
  ownerOnboardingMode: 'owner',
  ownerOnboardingParentOwnerId: null,
  ownerTab:     'today',
  mypageTab:    null, // deep-link target for MyPage sub-tab (reservations/favorites/messages)
  serviceTab:   'corporate',
  currentUser:  null,
  theme:        { ...INIT_THEME },
  heroBanners:  [...INIT_HERO_BANNERS],
  legalPages:   { ...INIT_LEGAL_PAGES },
  vehicles:     [...INIT_VEHICLES],
  parking:      [...INIT_PARKING],
  reservations: [...INIT_RESERVATIONS],
  users:        [...INIT_USERS],
  owners:       [],
  booking:      null,
  authOpen:     false,
  authMode:     'login',
  toast:        null,
  toastAction:  null,
  chatUnread:   0,
  searchParams: { cls: 'all', query: '', loc: '', pickup: '', ret: '', sort: 'recommended', airportCode: '' },
  mapView:      false,
  dbReady:      false, // true after KV hydration
};

// ── Reducer ──────────────────────────────────────────────────────────────────
function mergeReservationsById(existing = [], incoming = []) {
  // id 単位でマージ（サーバー値を優先しつつ、まだ反映前のローカル予約を消さない）
  const byId = new Map(existing.map(r => [String(r.id), r]));
  incoming.forEach(r => byId.set(String(r.id), { ...(byId.get(String(r.id)) ?? {}), ...r }));
  return [...byId.values()];
}

function reducer(state, action) {
  switch (action.type) {
    // ── DB hydration (called once on mount) ──────────────────────────────────
    case 'HYDRATE':
      return {
        ...state,
        vehicles:     action.data.vehicles     ?? state.vehicles,
        // 予約は「置き換え」ではなく「マージ」。/api/data がブラウザキャッシュ等で
        // 古くても、直近の予約（決済直後など）が一瞬で消えるのを防ぐ。
        reservations: action.data.reservations
          ? mergeReservationsById(state.reservations, action.data.reservations)
          : state.reservations,
        users:        action.data.users        ?? state.users,
        owners:       action.data.owners       ?? state.owners,
        parking:      action.data.parking      ?? state.parking,
        theme:        action.data.theme        ?? state.theme,
        heroBanners:  action.data.heroBanners  ?? state.heroBanners,
        legalPages:   action.data.legalPages   ?? state.legalPages,
        dbReady:      true,
      };

    case 'SET_MODE':         return { ...state, mode: action.v };
    case 'SET_ADMIN_TAB':   return { ...state, adminTab: action.v };
    case 'SET_PAGE':
      return action.v === 'owner-register'
        ? {
          ...state,
          frontendPage: action.v,
          ownerOnboardingMode: action.ownerOnboardingMode || 'owner',
          ownerOnboardingParentOwnerId: action.ownerOnboardingParentOwnerId ?? null,
        }
        : { ...state, frontendPage: action.v };
    case 'SET_MYPAGE_TAB':   return { ...state, frontendPage: 'mypage', mypageTab: action.v };
    case 'SET_OWNER_TAB':    return { ...state, ownerTab: action.v, frontendPage: 'owner-dashboard' };
    case 'SET_SERVICE':      return { ...state, serviceTab: action.v };
    case 'SET_USER':
      return {
        ...state,
        currentUser: action.user,
        authOpen: false,
        adminTab: action.user?.isMaster ? 'master' : state.adminTab,
      };
    case 'UPDATE_CURRENT_USER':
      return {
        ...state,
        currentUser: state.currentUser ? { ...state.currentUser, ...action.patch } : state.currentUser,
      };
    case 'LOGOUT':           return { ...state, currentUser: null, frontendPage: 'home', ownerOnboardingMode: 'owner', ownerOnboardingParentOwnerId: null };
    case 'SET_AUTH':         return { ...state, authOpen: action.open, authMode: action.mode || 'login' };
    case 'UPDATE_THEME':     return { ...state, theme: { ...state.theme, ...action.patch } };
    case 'UPDATE_HERO_BANNERS': return { ...state, heroBanners: action.banners };
    case 'UPDATE_LEGAL_PAGES':  return { ...state, legalPages: action.pages };

    case 'UPSERT_VEHICLE': {
      const exists = state.vehicles.find(v => v.id === action.v.id);
      return {
        ...state,
        vehicles: exists
          ? state.vehicles.map(v => v.id === action.v.id ? action.v : v)
          : [...state.vehicles, action.v],
      };
    }
    case 'UPSERT_VEHICLE_LOCAL': {
      const exists = state.vehicles.find(v => v.id === action.v.id);
      return {
        ...state,
        vehicles: exists
          ? state.vehicles.map(v => v.id === action.v.id ? { ...v, ...action.v } : v)
          : [...state.vehicles, action.v],
      };
    }
    case 'DELETE_VEHICLE':
      return { ...state, vehicles: state.vehicles.filter(v => v.id !== action.id) };

    case 'UPDATE_RES':
      return { ...state, reservations: state.reservations.map(r => r.id === action.r.id ? action.r : r) };
    case 'ADD_RES':
      return { ...state, reservations: [...state.reservations, action.r], booking: { ...state.booking, step: 8 } };
    case 'ADD_RES_LOCAL':
      return { ...state, reservations: [...state.reservations, action.r], booking: { ...state.booking, step: 8 } };
    case 'MERGE_RESERVATIONS': {
      // サーバーから取得した予約を id 単位でマージ（既存を消さず、最新で上書き）
      const incoming = action.reservations ?? [];
      if (incoming.length === 0) return state;
      const byId = new Map(state.reservations.map(r => [String(r.id), r]));
      incoming.forEach(r => byId.set(String(r.id), { ...(byId.get(String(r.id)) ?? {}), ...r }));
      return { ...state, reservations: [...byId.values()] };
    }

    case 'SET_BOOKING':   return { ...state, booking: action.b };
    case 'BOOK_STEP':     return { ...state, booking: { ...state.booking, ...action.patch } };
    case 'CLOSE_BOOKING': return { ...state, booking: null };
    case 'SET_SEARCH':    return { ...state, searchParams: { ...state.searchParams, ...action.patch }, frontendPage: 'search' };
    case 'TOGGLE_MAP':    return { ...state, mapView: !state.mapView };
    case 'TOAST':         return { ...state, toast: action.msg, toastAction: action.action ?? null };
    case 'SET_CHAT_UNREAD': return { ...state, chatUnread: action.count };
    case 'CLEAR_TOAST':   return { ...state, toast: null, toastAction: null };
    default:              return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, initialState);

  // ── Hydrate from KV on first load ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/data', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) rawDispatch({ type: 'HYDRATE', data }); })
      .catch(() => { /* KV not configured — stay with seed data */ });
  }, []);

  // ── Load admin-editable legal pages (separate store) ──────────────────────
  useEffect(() => {
    fetch('/api/legal')
      .then(r => r.ok ? r.json() : null)
      .then(pages => { if (pages && !pages.error) rawDispatch({ type: 'UPDATE_LEGAL_PAGES', pages }); })
      .catch(() => { /* keep default legal content */ });
  }, []);

  // ── Restore Supabase auth session after reload ───────────────────────────
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const user = userFromSupabase(data.session?.user);
        if (user) rawDispatch({ type: 'SET_USER', user });
      })
      .catch(() => {});

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = userFromSupabase(session?.user);
      rawDispatch(user ? { type: 'SET_USER', user } : { type: 'LOGOUT' });
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // ── Refresh THIS user's reservations from the server ──────────────────────
  // マイページの予約を常に最新化（外部Checkout/ウォレット決済後も確実に表示）
  const refreshUserReservations = useCallback(async (uid) => {
    const userId = uid ?? state.currentUser?.id;
    if (!userId) return;
    try {
      const res = await fetch(`/api/reservations?userId=${encodeURIComponent(userId)}&_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length) rawDispatch({ type: 'MERGE_RESERVATIONS', reservations: data });
    } catch { /* ignore */ }
  }, [state.currentUser?.id]);

  // ログイン中ユーザーの予約を取得（一覧が消える問題の恒久対策）
  useEffect(() => {
    if (state.currentUser?.id) refreshUserReservations(state.currentUser.id);
  }, [state.currentUser?.id, refreshUserReservations]);

  // ── Handle return from Stripe Checkout (Apple Pay / Google Pay) ────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const resId = params.get('res');
    const cs = params.get('cs');
    if (!checkout) return;

    const clean = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('res');
      url.searchParams.delete('cs');
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
    };
    const locale = currentLocale();

    if (checkout === 'success') {
      (async () => {
        try {
          if (resId) {
            const res = await fetch(`/api/checkout/confirm?res=${encodeURIComponent(resId)}${cs ? `&cs=${encodeURIComponent(cs)}` : ''}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (data?.reservation) rawDispatch({ type: 'MERGE_RESERVATIONS', reservations: [data.reservation] });
          }
        } catch { /* ignore — refresh below still surfaces it */ }
        await refreshUserReservations();
        rawDispatch({ type: 'TOAST', msg: tFn(locale, 'checkoutSuccessToast') });
        rawDispatch({ type: 'SET_MYPAGE_TAB', v: 'reservations' });
        clean();
      })();
    } else if (checkout === 'cancel') {
      rawDispatch({ type: 'TOAST', msg: tFn(locale, 'checkoutCancelToast') });
      clean();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-dismiss toast（タップ可能な通知は長めに表示）──────────────────────
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => rawDispatch({ type: 'CLEAR_TOAST' }), state.toastAction ? 8000 : 3200);
    return () => clearTimeout(t);
  }, [state.toast, state.toastAction]);

  // ── Persistent dispatch — optimistic UI + async KV write ─────────────────
  const dispatch = useCallback(async (action) => {
    rawDispatch(action); // update UI immediately
    if (action.persist === false) return;

    try {
      switch (action.type) {
        case 'UPSERT_VEHICLE': {
          const vRes = await fetch('/api/vehicles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.v),
          });
          if (!vRes.ok) {
            const vErr = await vRes.json().catch(() => ({}));
            console.error('[vehicle save error]', vErr);
            rawDispatch({ type: 'TOAST', msg: '車両の保存に失敗しました: ' + (vErr.error ?? vRes.status) });
          }
          // 成功時はオーナー画面の loadData で最新が再取得される
          break;
        }

        case 'DELETE_VEHICLE':
          await fetch(`/api/vehicles/${action.id}`, { method: 'DELETE' });
          break;

        case 'UPDATE_RES': {
          const resResp = await fetch('/api/reservations', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: action.r.id, status: action.r.status, stripePaymentIntentId: action.r.stripePaymentIntentId }),
          });
          if (!resResp.ok) {
            const resErr = await resResp.json().catch(() => ({}));
            console.error('[reservation update error]', resErr);
            rawDispatch({ type: 'TOAST', msg: '予約の更新に失敗しました: ' + (resErr.error ?? resResp.status) });
          }
          break;
        }

        case 'ADD_RES': {
          const resResp = await fetch('/api/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.r),
          });
          if (!resResp.ok) {
            const resErr = await resResp.json().catch(() => ({}));
            console.error('[reservation save error]', resErr);
            if (resResp.status === 409) {
              rawDispatch({ type: 'TOAST', msg: '⚠️ ' + (resErr.error ?? 'この期間は既に予約されています') });
            } else {
              rawDispatch({ type: 'TOAST', msg: '予約の保存に失敗しました: ' + (resErr.error ?? resResp.status) });
            }
          }
          break;
        }

        case 'UPDATE_THEME':
          await fetch('/api/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.patch),
          });
          break;

        case 'UPDATE_HERO_BANNERS':
          await fetch('/api/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banners: action.banners }),
          });
          break;

        case 'UPDATE_LEGAL_PAGES':
          await fetch('/api/legal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.pages),
          });
          break;

        case 'LOGOUT':
          await supabase.auth.signOut();
          break;

        default:
          break; // UI-only actions need no DB write
      }
    } catch (e) {
      console.warn('[persist] KV write failed:', e);
      // UI already updated — silent fail is acceptable for demo
    }
  }, []);

  return (
    <AppCtx.Provider value={{ state, dispatch }}>
      {children}
    </AppCtx.Provider>
  );
}
