'use client';

import { useEffect, useState } from 'react';

export function Snowfall() {
  const [mounted, setMounted] = useState(false);
  const [isChristmas, setIsChristmas] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check if Christmas theme is active
    const checkChristmasTheme = () => {
      const hasChristmasClass = document.documentElement.classList.contains('christmas');
      setIsChristmas(hasChristmasClass);
    };

    // Initial check
    checkChristmasTheme();

    // Watch for changes to the christmas class
    const observer = new MutationObserver(checkChristmasTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  // Don't render anything if not mounted or not Christmas theme
  if (!mounted || !isChristmas) {
    return null;
  }

  // Generate snowflakes
  const snowflakes = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 5 + Math.random() * 10,
    animationDelay: Math.random() * 5,
    fontSize: 10 + Math.random() * 20,
    opacity: 0.3 + Math.random() * 0.7,
  }));

  return (
    <div className="snowfall-container pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="snowflake absolute text-white"
          style={{
            left: `${flake.left}%`,
            fontSize: `${flake.fontSize}px`,
            opacity: flake.opacity,
            animation: `snowfall ${flake.animationDuration}s linear infinite`,
            animationDelay: `${flake.animationDelay}s`,
          }}
        >
          ❄
        </div>
      ))}

      <style jsx>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-10px) translateX(0);
          }
          100% {
            transform: translateY(100vh) translateX(${Math.random() * 50 - 25}px);
          }
        }

        .snowflake {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
