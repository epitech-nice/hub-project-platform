'use client';

import { useEffect, useState } from 'react';

export function SpringBackground() {
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

  return (
    <div className="spring-background-container pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Bottom-left corner - flowers */}
      <div className="absolute bottom-0 left-0 opacity-60 dark:opacity-40">
        <div className="relative">
          <div className="spring-flower" style={{ fontSize: '120px', position: 'absolute', bottom: '0', left: '20px' }}>
            🌸
          </div>
          <div className="spring-flower" style={{ fontSize: '90px', position: 'absolute', bottom: '10px', left: '160px', animationDelay: '0.5s' }}>
            🌷
          </div>
          <div className="spring-flower" style={{ fontSize: '70px', position: 'absolute', bottom: '5px', left: '270px', animationDelay: '1s' }}>
            🌼
          </div>
        </div>
      </div>

      {/* Bottom-right corner - more flowers */}
      <div className="absolute bottom-0 right-0 opacity-60 dark:opacity-40">
        <div className="relative">
          <div className="spring-flower" style={{ fontSize: '80px', position: 'absolute', bottom: '0', right: '20px', animationDelay: '0.3s' }}>
            🌻
          </div>
          <div className="spring-flower" style={{ fontSize: '70px', position: 'absolute', bottom: '5px', right: '110px', animationDelay: '0.8s' }}>
            🌸
          </div>
          <div className="spring-flower" style={{ fontSize: '90px', position: 'absolute', bottom: '0', right: '190px', animationDelay: '0.2s' }}>
            🌷
          </div>
          <div className="spring-flower" style={{ fontSize: '60px', position: 'absolute', bottom: '10px', right: '290px', animationDelay: '1.2s' }}>
            🌼
          </div>
        </div>
      </div>

      {/* Top-left corner - butterfly + sun */}
      <div className="absolute top-32 left-10 opacity-50 dark:opacity-35">
        <div className="relative">
          <div className="spring-butterfly" style={{ fontSize: '40px', position: 'absolute', top: '0', left: '0' }}>
            🦋
          </div>
          <div className="spring-butterfly" style={{ fontSize: '30px', position: 'absolute', top: '55px', left: '70px', animationDelay: '1s' }}>
            🦋
          </div>
          <div className="spring-twinkle" style={{ fontSize: '35px', position: 'absolute', top: '110px', left: '25px' }}>
            🌿
          </div>
        </div>
      </div>

      {/* Scattered elements */}
      <div className="absolute top-1/3 left-1/4 opacity-40 dark:opacity-25">
        <div className="spring-butterfly" style={{ fontSize: '35px', animationDelay: '2s' }}>
          🦋
        </div>
      </div>

      <div className="absolute bottom-1/4 right-1/3 opacity-40 dark:opacity-25">
        <div className="spring-twinkle" style={{ fontSize: '40px' }}>
          🌸
        </div>
      </div>

      <div className="absolute top-1/2 right-1/4 opacity-40 dark:opacity-25">
        <div className="spring-twinkle" style={{ fontSize: '35px', animationDelay: '1.5s' }}>
          🌼
        </div>
      </div>

      <style jsx>{`
        @keyframes spring-sway {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }

        @keyframes spring-flutter {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          25% { transform: translateY(-8px) rotate(5deg); }
          75% { transform: translateY(-4px) rotate(-3deg); }
        }

        @keyframes spring-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }

        .spring-flower {
          animation: spring-sway 4s ease-in-out infinite;
        }

        .spring-butterfly {
          animation: spring-flutter 3s ease-in-out infinite;
        }

        .spring-twinkle {
          animation: spring-pulse 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
