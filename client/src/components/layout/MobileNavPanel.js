import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/cn';

function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const prev = { overflow: document.body.style.overflow, position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

function NavSection({ label, items, onClose }) {
  const router = useRouter();
  return (
    <div>
      {label && (
        <div className="px-4 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-snug text-text-dim">
          {label}
        </div>
      )}
      {items.map((item) => {
        const active = router.asPath === item.href;
        return (
          <Link key={item.href} href={item.href}>
            <a
              onClick={onClose}
              className={cn(
                'flex items-center px-4 py-2.5 text-sm transition-colors duration-100',
                'hover:bg-surface-2',
                'focus-visible:outline-none focus-visible:bg-surface-2',
                active ? 'text-primary font-medium' : 'text-text'
              )}
            >
              {item.label}
            </a>
          </Link>
        );
      })}
    </div>
  );
}

export default function MobileNavPanel({ open, onClose, sections = [] }) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef(null);
  const router = useRouter();

  useScrollLock(open);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (open) onClose(); }, [router.asPath]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus first focusable element when panel opens
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const first = panelRef.current.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
    first?.focus();
  }, [open]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onMouseDown={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-72 max-w-[85vw]',
          'bg-surface border-l border-border shadow-lg',
          'flex flex-col',
          'transition-transform duration-250 ease-smooth',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-text">Navigation</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              'text-text-muted hover:text-text hover:bg-surface-2',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
            )}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Nav content */}
        <nav className="flex-1 overflow-y-auto py-2">
          {sections.map((section, si) => (
            <div key={si}>
              {si > 0 && <div className="my-2 mx-4 border-t border-border" />}
              <NavSection label={section.label} items={section.items} onClose={onClose} />
            </div>
          ))}
        </nav>
      </div>
    </>,
    document.body
  );
}
