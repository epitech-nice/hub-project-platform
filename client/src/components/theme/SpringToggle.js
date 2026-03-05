'use client';

import { useEffect, useState } from 'react';

export function SpringToggle() {
  const [mounted, setMounted] = useState(false);
  const [isSpring, setIsSpring] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('spring-theme');
    const shouldBeSpring = saved === 'true';
    setIsSpring(shouldBeSpring);

    if (shouldBeSpring) {
      document.documentElement.classList.add('spring');
    } else {
      document.documentElement.classList.remove('spring');
    }
  }, []);

  const toggleSpring = () => {
    const newValue = !isSpring;
    setIsSpring(newValue);
    localStorage.setItem('spring-theme', newValue.toString());

    if (newValue) {
      document.documentElement.classList.add('spring');
    } else {
      document.documentElement.classList.remove('spring');
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={toggleSpring}
      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title={isSpring ? 'Désactiver le thème printemps' : 'Activer le thème printemps'}
    >
      {isSpring ? '🌸' : '🌷'}
    </button>
  );
}
