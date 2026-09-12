'use client';

// ローディング画面の中身（画像＋グロー＋シャイン×2＋上昇粒子＋バー＋ドット）
// AppLoader（起動時）と OneWayBanner（One-Way遷移時）で共有。
const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const size = 4 + ((i * 37) % 8);            // 4〜11px
  const left = (i * 53) % 100;                // 0〜99%
  const dur = 4 + ((i * 29) % 40) / 10;       // 4〜8s
  const delay = ((i * 71) % 60) / 10;         // 0〜6s
  const drift = ((i % 2 === 0) ? 1 : -1) * (4 + (i % 5) * 3);
  return { size, left, dur, delay, drift, key: i };
});

export default function LoaderOverlay({ src }) {
  return (
    <div className="app-loader__frame">
      <img className="app-loader__img" src={src} alt="" />
      <div className="app-loader__glow" />
      <div className="app-loader__shine" />
      <div className="app-loader__shine app-loader__shine--2" />

      <div className="app-loader__particles">
        {PARTICLES.map(p => (
          <span
            key={p.key}
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              marginLeft: `${p.drift}px`,
            }}
          />
        ))}
      </div>

      <div className="app-loader__bottom">
        <div className="app-loader__bar" />
        <div className="app-loader__dots"><span /><span /><span /></div>
      </div>
    </div>
  );
}
