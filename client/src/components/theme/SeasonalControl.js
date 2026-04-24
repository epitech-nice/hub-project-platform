import { useState, useEffect, useRef, useCallback } from 'react';
import { getSeasonalPreference, setSeasonalPreference, resolveSeason } from '../../lib/seasonal';
import { cn } from '../../lib/cn';

const OPTIONS = [
  { value: 'auto',      label: 'Auto',       icon: '🗓' },
  { value: 'christmas', label: 'Noël',       icon: '🎄' },
  { value: 'spring',    label: 'Printemps',  icon: '🌸' },
  { value: 'off',       label: 'Désactivé',  icon: '✕' },
];

function getActiveIcon(pref) {
  const season = resolveSeason(pref);
  if (season === 'christmas') return '🎄';
  if (season === 'spring') return '🌸';
  return '✦';
}

export default function SeasonalControl() {
  const [mounted, setMounted] = useState(false);
  const [pref, setPref] = useState('auto');
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    setPref(getSeasonalPreference());
  }, []);

  const apply = useCallback((value) => {
    setPref(value);
    setSeasonalPreference(value);
    const season = resolveSeason(value);
    document.documentElement.classList.remove('christmas', 'spring');
    if (season) document.documentElement.classList.add(season);
    window.dispatchEvent(new CustomEvent('seasonchange', { detail: { season } }));
    setOpen(false);
  }, []);

  // Close on click-outside and ESC
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('keydown', handleKey); document.removeEventListener('mousedown', handleClick); };
  }, [open]);

  if (!mounted) return null;

  const icon = getActiveIcon(pref);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Thème saisonnier"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md text-base',
          'text-text-muted hover:text-text hover:bg-surface-2',
          'transition-colors duration-150 ease-smooth',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
        )}
      >
        {icon}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            'absolute right-0 top-full mt-1 z-50',
            'min-w-36 rounded-lg border border-border bg-surface shadow-md',
            'py-1 animate-slide-up'
          )}
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="menuitem"
              type="button"
              onClick={() => apply(opt.value)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm',
                'transition-colors duration-100',
                'hover:bg-surface-2',
                'focus-visible:outline-none focus-visible:bg-surface-2',
                pref === opt.value ? 'text-primary font-medium' : 'text-text'
              )}
            >
              <span className="w-5 text-center">{opt.icon}</span>
              {opt.label}
              {pref === opt.value && (
                <span className="ml-auto text-primary" aria-hidden="true">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
