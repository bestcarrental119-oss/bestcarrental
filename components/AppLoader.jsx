'use client';

import { useState, useEffect } from 'react';
import LoaderOverlay from './LoaderOverlay';

/**
 * Full-screen launch/loading splash shown on app start.
 * Fades in, ken-burns zoom + shimmer sweeps + rising sparkles + progress, then fades out.
 * Auto-dismisses after `duration` ms so it never blocks the app.
 */
export default function AppLoader({ duration = 2600 }) {
  const [phase, setPhase] = useState('show'); // 'show' → 'hide' → 'gone'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hide'), duration);
    const t2 = setTimeout(() => setPhase('gone'), duration + 650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration]);

  if (phase === 'gone') return null;

  return (
    <div className={`app-loader${phase === 'hide' ? ' app-loader--hide' : ''}`} aria-hidden="true">
      <LoaderOverlay src="/loading-cover.jpg" />
    </div>
  );
}
