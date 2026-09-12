/**
 * Capacitor configuration for the iOS / Android native shells.
 *
 * Kept as plain JS (not .ts) so the Next.js / Vercel web build never pulls in
 * TypeScript tooling. The native apps load the DEPLOYED web app over HTTPS
 * (server.url), so Web / iOS / Android share one codebase.
 *
 * Set NEXT_PUBLIC_APP_URL to your production URL, or edit APP_URL below.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://best-car-rental.vercel.app';

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.bestcarrental.app',
  appName: 'BEST Car Rental',
  webDir: 'out', // only used when bundling a static export; ignored when server.url is set
  server: {
    url: APP_URL,
    cleartext: false,
    allowNavigation: [
      '*.stripe.com',
      '*.supabase.co',
      '*.google.com',
      'accounts.google.com',
    ],
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#17012E',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

module.exports = config;
