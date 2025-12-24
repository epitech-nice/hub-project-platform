'use client';

import { useEffect, useState } from 'react';

export function ChristmasToggle() {
  const [mounted, setMounted] = useState(false);
  const [isChristmas, setIsChristmas] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('christmas-theme');
    const shouldBeChristmas = saved === 'true';
    setIsChristmas(shouldBeChristmas);

    // Apply the class to the document root
    if (shouldBeChristmas) {
      document.documentElement.classList.add('christmas');
    } else {
      document.documentElement.classList.remove('christmas');
    }
  }, []);

  const toggleChristmas = () => {
    const newValue = !isChristmas;
    setIsChristmas(newValue);
    localStorage.setItem('christmas-theme', newValue.toString());

    // Toggle the class on the document root
    if (newValue) {
      document.documentElement.classList.add('christmas');
    } else {
      document.documentElement.classList.remove('christmas');
    }
  };

  // Prevent hydration errors
  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={toggleChristmas}
      className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title={isChristmas ? 'Switch to normal theme' : 'Switch to Christmas theme'}
    >
      {isChristmas ? '🎄' : '🎅'}
    </button>
  );
}
