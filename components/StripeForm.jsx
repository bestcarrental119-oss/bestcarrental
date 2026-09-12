'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18nContext';

/**
 * Stripe Card Element plus Stripe Payment Request Button for wallet payments.
 *
 * Props:
 *   onReady(stripe, cardElement) – called once the element is mounted
 *   primaryColor                 – used for Stripe appearance theming
 *   amount                       – JPY amount used by Apple Pay / Google Pay
 *   onWalletPayment(payload)     – confirms a wallet payment method server-side
 */
export default function StripeForm({ onReady, onWalletPayment, amount = 0, primaryColor = '#2563eb' }) {
  const { t } = useI18n();
  const mountRef = useRef(null);
  const walletRef = useRef(null);
  const [ready, setReady]     = useState(false);
  const [walletReady, setWalletReady] = useState(false);
  const [cardError, setCardError] = useState('');
  const [walletError, setWalletError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Stripe) {
      setCardError('Stripe.js failed to load. Check your internet connection.');
      return;
    }
    if (!mountRef.current || !walletRef.current) return;

    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk || pk === 'pk_test_YOUR_PUBLISHABLE_KEY') {
      setCardError('⚠️ Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.local');
      return;
    }

    let stripe, card, walletElement;
    let cancelled = false;
    try {
      stripe = window.Stripe(pk);
      const elements = stripe.elements({ locale: 'auto' });
      const walletAmount = Math.max(0, Math.round(Number(amount) || 0));
      const paymentRequest = stripe.paymentRequest({
        country: 'JP',
        currency: 'jpy',
        total: {
          label: 'BEST Car Rental',
          amount: walletAmount,
        },
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true,
      });
      card = elements.create('card', {
        hidePostalCode: true,
        iconStyle: 'solid',
        style: {
          base: {
            fontSize: '15px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            color: '#f9fafb',
            '::placeholder': { color: '#6b7280' },
            iconColor: '#9ca3af',
            lineHeight: '28px',
          },
          invalid:  { color: '#f87171', iconColor: '#f87171' },
          complete: { color: '#34d399', iconColor: '#34d399' },
        },
      });
      card.mount(mountRef.current);
      card.on('ready',  () => setReady(true));
      card.on('change', e => setCardError(e.error?.message ?? ''));
      paymentRequest.canMakePayment()
        .then(result => {
          if (cancelled || !result || walletAmount <= 0 || !walletRef.current) return;
          const PaymentRequestButton = 'paymentRequestButton';
          walletElement = elements.create(PaymentRequestButton, {
            paymentRequest,
            style: {
              paymentRequestButton: {
                type: 'default',
                theme: 'dark',
                height: '44px',
              },
            },
          });
          walletElement.mount(walletRef.current);
          setWalletReady(true);
        })
        .catch(() => setWalletError('Wallet payments are not available in this browser.'));
      paymentRequest.on('paymentmethod', async (event) => {
        setWalletError('');
        try {
          const result = await onWalletPayment?.({
            stripe,
            paymentMethodId: event.paymentMethod.id,
            payer: {
              name: event.payerName,
              email: event.payerEmail,
              phone: event.payerPhone,
            },
          });
          if (result?.ok === false) throw new Error(result.error ?? 'Wallet payment failed.');
          event.complete('success');
        } catch (err) {
          event.complete('fail');
          setWalletError(err.message ?? 'Wallet payment failed.');
        }
      });
      onReady?.(stripe, card);
    } catch (err) {
      setCardError(`Stripe error: ${err.message}`);
    }

    return () => {
      cancelled = true;
      try { card?.destroy(); } catch (_) {}
      try { walletElement?.destroy(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  return (
    <div>
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1.5">
          {t('pay_walletLabel')}
        </label>
        <div ref={walletRef} className="min-h-[44px]" />
        {!walletReady && !walletError && (
          <p className="text-gray-600 text-xs mt-1.5">
            {t('pay_walletHint')}
          </p>
        )}
        {walletError && <p className="text-gray-500 text-xs mt-1.5">{walletError}</p>}
      </div>
      <label className="block text-xs text-gray-400 mb-1.5">
        {t('pay_cardLabel')} <span className="text-gray-600">(Stripe)</span>
      </label>
      <div
        ref={mountRef}
        className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 min-h-[46px] transition-colors focus-within:border-blue-500"
      />
      {!ready && !cardError && (
        <p className="text-gray-500 text-xs mt-1.5 animate-pulse">Loading secure card form…</p>
      )}
      {cardError && (
        <p className="text-red-400 text-xs mt-1.5">{cardError}</p>
      )}
      <p className="text-gray-600 text-xs mt-1.5">
        🔒 Card data is processed exclusively by Stripe — PCI DSS Level 1
      </p>
    </div>
  );
}
