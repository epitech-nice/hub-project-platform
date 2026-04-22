import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/cn';

const ChevronDown = ({ open }) => (
  <svg
    className={cn('h-4 w-4 transition-transform duration-200 ease-smooth', open && 'rotate-180')}
    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"
  >
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function NavDropdown({ label, sections = [] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const isActive = sections.some((s) => s.items.some((item) => router.asPath === item.href));

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Click-outside + ESC
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') close(); };
    const handleClick = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, close]);

  useEffect(() => { setOpen(false); }, [router.asPath]);

  // Arrow-key navigation among menuitem elements (ARIA APG Menu Button pattern)
  const handleMenuKeyDown = (e) => {
    const items = menuRef.current
      ? Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'))
      : [];
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };

  // Focus first menuitem when menu opens
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const first = menuRef.current.querySelector('[role="menuitem"]');
    first?.focus();
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex items-center gap-1 text-sm font-medium px-1 py-0.5 rounded',
          'transition-colors duration-150 ease-smooth',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          isActive ? 'text-primary' : 'text-text-muted hover:text-text'
        )}
      >
        {label}
        <ChevronDown open={open} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            'absolute left-0 top-full mt-2 z-50 min-w-52',
            'rounded-lg border border-border bg-surface shadow-lg py-1',
            'animate-fade-scale'
          )}
        >
          {sections.map((section, si) => (
            <div key={si}>
              {si > 0 && <div className="my-1 border-t border-border" />}
              {section.label && (
                <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-snug text-text-dim">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const active = router.asPath === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      role="menuitem"
                      className={cn(
                        'flex items-center px-3 py-2 text-sm',
                        'transition-colors duration-100',
                        'hover:bg-surface-2',
                        'focus-visible:outline-none focus-visible:bg-surface-2',
                        active ? 'text-primary font-medium' : 'text-text'
                      )}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </a>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
