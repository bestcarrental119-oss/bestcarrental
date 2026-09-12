'use client';
import { useEffect } from 'react';
import { useApp } from '../lib/context';
import FrontendApp from '../components/FrontendApp';
import AdminApp from '../components/AdminApp';
import AuthModal from '../components/AuthModal';
import { Toast } from '../components/Shared';

export default function Page() {
  const { state, dispatch } = useApp();
  const { mode, toast, toastAction, vehicles, currentUser } = state;

  // 直リンクのショートカット。ログイン後に以下のURLで直接ジャンプできる：
  //   ...?panel=admin   → 管理画面（admin / master のみ）
  //   ...?panel=master  → 管理画面のマスタータブ（master のみ）
  // currentUser はセッション読込後に入るため、読み込まれた時点で再評価する。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const panel = (params.get('panel') || window.location.hash.replace('#', '')).toLowerCase();
    if (!panel) return;
    const isAdminLike = currentUser?.role === 'admin' || currentUser?.isMaster;
    if ((panel === 'master' || panel === 'admin') && currentUser?.isMaster) {
      dispatch({ type: 'SET_MODE', v: 'admin' });
      dispatch({ type: 'SET_ADMIN_TAB', v: 'master' });
    } else if (panel === 'admin' && isAdminLike) {
      dispatch({ type: 'SET_MODE', v: 'admin' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.isMaster, currentUser?.role]);

  // トースト（チャット通知）をタップ → その会話を直接開く
  const handleToastAction = () => {
    const a = toastAction;
    if (!a) return;
    if (a.kind === 'inbox' || a.kind === 'openChat') {
      // お客様：マイページの「メッセージ」受信箱を開く
      dispatch({ type: 'SET_PAGE', v: 'mypage' });
      if (typeof window !== 'undefined') {
        // MyPage がマウントされてから受信箱タブへ切り替え
        setTimeout(() => window.__openInbox?.(), 60);
      }
    } else if (a.kind === 'review') {
      dispatch({ type: 'SET_MYPAGE_TAB', v: 'reservations' });
    } else if (a.kind === 'ownerChat') {
      if (typeof window !== 'undefined' && window.__openOwnerChat) window.__openOwnerChat();
    } else if (a.kind === 'ownerReviews') {
      dispatch({ type: 'SET_OWNER_TAB', v: 'renters' });
    } else if (a.kind === 'ownerReservations') {
      dispatch({ type: 'SET_PAGE', v: 'owner-dashboard' });
      dispatch({ type: 'SET_OWNER_TAB', v: 'reservations' });
    }
    dispatch({ type: 'CLEAR_TOAST' });
  };

  return (
    <>
      {mode === 'frontend' && <FrontendApp />}
      {mode === 'admin'    && <AdminApp />}
      <AuthModal />
      <Toast msg={toast} action={toastAction} onAction={handleToastAction} />
    </>
  );
}
