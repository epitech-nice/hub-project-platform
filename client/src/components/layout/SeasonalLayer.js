import { useEffect, useState, useMemo } from 'react';
import { getSeasonalPreference, resolveSeason } from '../../lib/seasonal';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function useMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setMobile(mq.matches);
    const handler = (e) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

// ── Christmas particles ──────────────────────────────────────────────────────

function ChristmasParticles({ count }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: (i / count) * 100 + (Math.random() - 0.5) * (100 / count),
        duration: 5 + (i % 10),
        delay: (i % 5),
        size: 10 + (i % 20),
        opacity: 0.3 + (i % 7) * 0.1,
      })),
    [count]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="absolute text-white seasonal-particle-fall"
          style={{
            left: `${f.left}%`,
            fontSize: `${f.size}px`,
            opacity: f.opacity,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}

// ── Spring particles ─────────────────────────────────────────────────────────

const SPRING_EMOJIS = ['🌸', '🌸', '🌸', '🌺', '🌼'];

function SpringParticles({ count }) {
  const petals = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: (i / count) * 100 + (Math.random() - 0.5) * (100 / count),
        duration: 6 + (i % 10),
        delay: (i % 6),
        size: 12 + (i % 18),
        opacity: 0.4 + (i % 6) * 0.1,
        emoji: SPRING_EMOJIS[i % SPRING_EMOJIS.length],
      })),
    [count]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {petals.map((p) => (
        <span
          key={p.id}
          className="absolute seasonal-particle-petal"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Christmas background ─────────────────────────────────────────────────────

function ChristmasBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute bottom-0 left-0 opacity-60 dark:opacity-40">
        {[['150px', '20px'], ['100px', '180px'], ['80px', '300px']].map(([size, left], i) => (
          <div key={i} className="seasonal-sway absolute bottom-0" style={{ fontSize: size, left }}> 🎄</div>
        ))}
      </div>
      <div className="absolute bottom-0 right-0 opacity-60 dark:opacity-40">
        {[['70px', '20px'], ['60px', '100px'], ['80px', '170px'], ['50px', '260px']].map(([size, right], i) => (
          <div key={i} className="seasonal-bounce absolute bottom-0" style={{ fontSize: size, right }}>🎁</div>
        ))}
      </div>
      <div className="absolute top-32 left-10 opacity-50 dark:opacity-35">
        <div className="seasonal-twinkle absolute" style={{ fontSize: '40px' }}>⭐</div>
        <div className="seasonal-twinkle absolute top-12 left-14" style={{ fontSize: '30px', animationDelay: '1s' }}>⭐</div>
        <div className="seasonal-twinkle absolute top-24 left-5" style={{ fontSize: '35px', animationDelay: '0.5s' }}>🔴</div>
      </div>
      <div className="absolute top-1/3 left-1/4 opacity-40 dark:opacity-25">
        <div className="seasonal-twinkle" style={{ fontSize: '35px', animationDelay: '2s' }}>⭐</div>
      </div>
      <div className="absolute top-1/2 right-1/4 opacity-40 dark:opacity-25">
        <div className="seasonal-twinkle" style={{ fontSize: '35px', animationDelay: '1.5s' }}>🔴</div>
      </div>
    </div>
  );
}

// ── Spring background ────────────────────────────────────────────────────────

function SpringBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute bottom-0 left-0 opacity-60 dark:opacity-40">
        {[['120px', '20px'], ['90px', '160px'], ['70px', '270px']].map(([size, left], i) => (
          <div key={i} className="seasonal-sway absolute bottom-0" style={{ fontSize: size, left }}>
            {['🌸', '🌷', '🌼'][i]}
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 right-0 opacity-60 dark:opacity-40">
        {[['80px', '20px'], ['70px', '110px'], ['90px', '190px'], ['60px', '290px']].map(([size, right], i) => (
          <div key={i} className="seasonal-sway absolute bottom-0" style={{ fontSize: size, right, animationDelay: `${i * 0.3}s` }}>
            {['🌻', '🌸', '🌷', '🌼'][i]}
          </div>
        ))}
      </div>
      <div className="absolute top-32 left-10 opacity-50 dark:opacity-35">
        <div className="seasonal-flutter absolute" style={{ fontSize: '40px' }}>🦋</div>
        <div className="seasonal-flutter absolute top-14 left-16" style={{ fontSize: '30px', animationDelay: '1s' }}>🦋</div>
        <div className="seasonal-twinkle absolute top-24 left-6" style={{ fontSize: '35px' }}>🌿</div>
      </div>
      <div className="absolute top-1/3 left-1/4 opacity-40 dark:opacity-25">
        <div className="seasonal-flutter" style={{ fontSize: '35px', animationDelay: '2s' }}>🦋</div>
      </div>
      <div className="absolute top-1/2 right-1/4 opacity-40 dark:opacity-25">
        <div className="seasonal-twinkle" style={{ fontSize: '35px', animationDelay: '1.5s' }}>🌼</div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SeasonalLayer() {
  const [mounted, setMounted] = useState(false);
  const [season, setSeason] = useState(null);
  const reducedMotion = useReducedMotion();
  const mobile = useMobile();

  useEffect(() => {
    setMounted(true);
    const pref = getSeasonalPreference();
    const active = resolveSeason(pref);
    setSeason(active);

    // Apply class on <html>
    document.documentElement.classList.remove('christmas', 'spring');
    if (active) document.documentElement.classList.add(active);
  }, []);

  if (!mounted || !season || reducedMotion) return null;

  const particleCount = mobile
    ? season === 'christmas' ? 25 : 20
    : season === 'christmas' ? 50 : 40;

  return (
    <>
      {season === 'christmas' ? <ChristmasBg /> : <SpringBg />}
      {season === 'christmas'
        ? <ChristmasParticles count={particleCount} />
        : <SpringParticles count={particleCount} />}
    </>
  );
}
