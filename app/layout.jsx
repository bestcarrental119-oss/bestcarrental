import './globals.css';
import Script from 'next/script';
import { AppProvider } from '../lib/context';
import { I18nProvider } from '../lib/i18nContext';
import { CurrencyProvider } from '../lib/currency';

export const metadata = {
  title: 'Best Car Rental — Global Mobility Platform',
  description: 'Car Rental · P2P Car Share · Parking Space — all in one platform.',
  keywords: 'car rental, car share, p2p rental, parking, Japan, レンタカー',
  applicationName: 'BEST Car Rental',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BEST Car Rental',
  },
};

export const viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,   // lock zoom → no accidental pinch / iOS input auto-zoom
  viewportFit: 'cover',  // draw under the notch; safe-area padding handles insets
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script src="https://js.stripe.com/v3/" strategy="beforeInteractive" />
      </head>
      <body>
        <I18nProvider>
          <CurrencyProvider>
            <AppProvider>
              {children}
            </AppProvider>
          </CurrencyProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
