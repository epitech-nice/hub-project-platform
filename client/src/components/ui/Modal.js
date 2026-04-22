import { useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useFocusTrap(containerRef, open) {
  useEffect(() => {
    if (!open || !containerRef.current) return;

    const previouslyFocused = document.activeElement;
    const el = containerRef.current;
    el.querySelector(FOCUSABLE)?.focus();

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(el.querySelectorAll(FOCUSABLE));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, containerRef]);
}

function useScrollLock(open) {
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  className = '',
}) {
  const containerRef = useRef(null);
  const titleId = useId();

  useFocusTrap(containerRef, open);
  useScrollLock(open);

  const handleEsc = useCallback(
    (e) => { if (e.key === 'Escape') onClose?.(); },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, handleEsc]);

  if (typeof document === 'undefined') return null;
  if (!open) return null;

  const MAX_W = size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={containerRef}
        className={cn(
          'relative z-10 flex flex-col bg-surface shadow-lg',
          'w-full max-w-none h-full rounded-none',
          `sm:rounded-xl sm:h-auto ${MAX_W}`,
          'animate-slide-up',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          {title && (
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'ml-auto rounded-md p-1.5 text-text-dim hover:text-text hover:bg-surface-2',
              'transition-colors duration-150 ease-smooth',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
            )}
            aria-label="Fermer"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
