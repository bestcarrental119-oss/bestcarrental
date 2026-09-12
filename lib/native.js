'use client';
/**
 * Native (Capacitor) bridge.
 *
 * Every function here is a safe no-op on the plain web build — the Capacitor
 * packages are only present/active inside the iOS & Android shells, so the same
 * React code runs everywhere. Import and call `initNative()` once from a
 * top-level client component (e.g. FrontendApp) inside a useEffect.
 */

export const isNativeApp = () =>
  typeof window !== 'undefined' &&
  !!window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

export const nativePlatform = () =>
  (typeof window !== 'undefined' && window.Capacitor?.getPlatform?.()) || 'web';

/** Initialise splash / status bar / keyboard / hardware-back behaviour. */
export async function initNative() {
  if (!isNativeApp()) return;

  // Tag the document so CSS can adapt the layout specifically for the native
  // app (safe areas, no long-press callouts, hide web-only chrome, etc.).
  try {
    const el = document.documentElement;
    el.classList.add('is-native-app');
    el.classList.add(`platform-${nativePlatform()}`);
  } catch { /* ignore */ }

  try {
    const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
      import('@capacitor/splash-screen'),
      import('@capacitor/status-bar'),
      import('@capacitor/app'),
    ]);

    await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: '#7C3AED' }).catch(() => {});

    // Android hardware back: go back in history, else stay (don't kill the app).
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
    });

    // Hide the splash after the web app has painted.
    setTimeout(() => SplashScreen.hide().catch(() => {}), 400);
  } catch {
    /* plugins not installed on web — ignore */
  }
}

/** Ask for and read the current GPS position (for "近くの車" search). */
export async function getCurrentPosition() {
  if (!isNativeApp()) {
    return new Promise((resolve) => {
      if (!navigator?.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}

/** Register for push notifications and hand the device token to your backend. */
export async function registerPush(onToken) {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.register();
    PushNotifications.addListener('registration', (t) => onToken?.(t.value));
  } catch {
    /* ignore */
  }
}

/**
 * Capture a photo from the camera. Native (iOS/Android) uses the real camera
 * via Capacitor; on the web it falls back to a file input with `capture` so
 * phones still open the camera. Returns a JPEG data URL, or null if cancelled.
 */
export async function capturePhoto() {
  if (isNativeApp()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 60,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        allowEditing: false,
        correctOrientation: true,
      });
      return photo?.dataUrl ?? null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    } catch {
      resolve(null);
    }
  });
}

/** Downscale a data-URL image (keeps payloads small before upload). */
export function downscaleImage(dataUrl, maxDim = 1280, quality = 0.6) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

/**
 * Haptic feedback. On native iOS/Android uses the real Taptic/vibration engine;
 * on the web falls back to the Vibration API (Android browsers). `style`:
 * 'light' | 'medium' | 'heavy' | 'success' | 'error'.
 */
export async function haptic(style = 'medium') {
  try {
    const pattern = style === 'success' ? [25, 40, 25]
      : style === 'error' ? [60, 50, 60]
      : style === 'heavy' ? 40 : style === 'light' ? 12 : 22;
    navigator?.vibrate?.(pattern);
  } catch { /* ignore */ }
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (style === 'success') await Haptics.notification({ type: NotificationType.Success });
    else if (style === 'error') await Haptics.notification({ type: NotificationType.Error });
    else await Haptics.impact({ style: style === 'heavy' ? ImpactStyle.Heavy : style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium });
  } catch { /* ignore */ }
}

/**
 * Short synthesized beep via WebAudio (no asset files needed). Works on web and
 * inside the native webview. kind: 'success' (rising two-tone) | 'error' (low).
 */
export function beep(kind = 'success') {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const tone = (freq, start, dur, vol = 0.18) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.02);
    };
    if (kind === 'error') {
      tone(220, 0, 0.28, 0.2);
    } else {
      tone(880, 0, 0.14);
      tone(1320, 0.12, 0.22);
    }
    setTimeout(() => ctx.close?.(), 600);
  } catch { /* ignore */ }
}
