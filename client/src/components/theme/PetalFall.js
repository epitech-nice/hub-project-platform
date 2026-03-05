'use client';

import { useEffect, useState } from 'react';

export function PetalFall() {
  const [mounted, setMounted] = useState(false);
  const [isSpring, setIsSpring] = useState(false);

  useEffect(() => {
    setMounted(true);

    const checkSpringTheme = () => {
      const hasSpringClass = document.documentElement.classList.contains('spring');
      setIsSpring(hasSpringClass);
    };

    checkSpringTheme();

    const observer = new MutationObserver(checkSpringTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  if (!mounted || !isSpring) {
    return null;
  }

  const petals = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 6 + Math.random() * 10,
    animationDelay: Math.random() * 6,
    fontSize: 12 + Math.random() * 18,
    opacity: 0.4 + Math.random() * 0.6,
    emoji: ['🌸', '🌸', '🌸', '🌺', '🌼'][Math.floor(Math.random() * 5)],
  }));

  return (
    <div className="petalfall-container pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {petals.map((petal) => (
        <div
          key={petal.id}
          className="petal absolute"
          style={{
            left: `${petal.left}%`,
            fontSize: `${petal.fontSize}px`,
            opacity: petal.opacity,
            animation: `petalfall ${petal.animationDuration}s linear infinite`,
            animationDelay: `${petal.animationDelay}s`,
          }}
        >
          {petal.emoji}
        </div>
      ))}

      <style jsx>{`
        @keyframes petalfall {
          0% {
            transform: translateY(-20px) translateX(0) rotate(0deg);
          }
          50% {
            transform: translateY(50vh) translateX(30px) rotate(180deg);
          }
          100% {
            transform: translateY(100vh) translateX(-10px) rotate(360deg);
          }
        }

        .petal {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
