'use client';

import { useEffect, useState } from 'react';

export function ChristmasBackground() {
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

  return (
    <div className="christmas-background-container pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Bottom-left corner - Christmas trees */}
      <div className="absolute bottom-0 left-0 opacity-60 dark:opacity-40">
        <div className="relative">
          {/* Large tree */}
          <div className="christmas-tree" style={{ fontSize: '150px', position: 'absolute', bottom: '0', left: '20px' }}>
            🎄
          </div>
          {/* Medium tree */}
          <div className="christmas-tree" style={{ fontSize: '100px', position: 'absolute', bottom: '10px', left: '180px' }}>
            🎄
          </div>
          {/* Small tree */}
          <div className="christmas-tree" style={{ fontSize: '80px', position: 'absolute', bottom: '5px', left: '300px' }}>
            🎄
          </div>
        </div>
      </div>

      {/* Bottom-right corner - Gifts */}
      <div className="absolute bottom-0 right-0 opacity-60 dark:opacity-40">
        <div className="relative">
          {/* Gift boxes */}
          <div className="christmas-gift" style={{ fontSize: '70px', position: 'absolute', bottom: '0', right: '20px' }}>
            🎁
          </div>
          <div className="christmas-gift" style={{ fontSize: '60px', position: 'absolute', bottom: '5px', right: '100px' }}>
            🎁
          </div>
          <div className="christmas-gift" style={{ fontSize: '80px', position: 'absolute', bottom: '0', right: '170px' }}>
            🎁
          </div>
          <div className="christmas-gift" style={{ fontSize: '50px', position: 'absolute', bottom: '10px', right: '260px' }}>
            🎁
          </div>
        </div>
      </div>

      {/* Top-left corner - Stars and ornaments */}
      <div className="absolute top-32 left-10 opacity-50 dark:opacity-35">
        <div className="relative">
          <div className="twinkle-star" style={{ fontSize: '40px', position: 'absolute', top: '0', left: '0' }}>
            ⭐
          </div>
          <div className="twinkle-star" style={{ fontSize: '30px', position: 'absolute', top: '50px', left: '60px', animationDelay: '1s' }}>
            ⭐
          </div>
          <div className="christmas-ornament" style={{ fontSize: '35px', position: 'absolute', top: '100px', left: '20px' }}>
            🔴
          </div>
        </div>
      </div>

      {/* Additional decorative elements scattered around */}
      <div className="absolute top-1/3 left-1/4 opacity-40 dark:opacity-25">
        <div className="twinkle-star" style={{ fontSize: '35px', animationDelay: '2s' }}>
          ⭐
        </div>
      </div>

      <div className="absolute bottom-1/4 right-1/3 opacity-40 dark:opacity-25">
        <div className="christmas-ornament" style={{ fontSize: '40px' }}>
          🔵
        </div>
      </div>

      <div className="absolute top-1/2 right-1/4 opacity-40 dark:opacity-25">
        <div className="christmas-ornament" style={{ fontSize: '35px', animationDelay: '1.5s' }}>
          🔴
        </div>
      </div>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.2);
          }
        }

        @keyframes sway {
          0%, 100% {
            transform: rotate(-2deg);
          }
          50% {
            transform: rotate(2deg);
          }
        }

        @keyframes gift-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        .twinkle-star {
          animation: twinkle 3s ease-in-out infinite;
        }

        .christmas-tree {
          animation: sway 4s ease-in-out infinite;
        }

        .christmas-gift {
          animation: gift-bounce 2s ease-in-out infinite;
        }

        .christmas-ornament {
          animation: twinkle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
