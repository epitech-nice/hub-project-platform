import { cn } from '../../lib/cn';

/**
 * ErrorPage — full-page error display for 404, 403, 500, etc.
 *
 * Props:
 *   code:    string | number — HTTP status or short code (e.g. "404", "Erreur")
 *   title:   string
 *   sub:     string (optional)
 *   action:  ReactNode — primary CTA (optional)
 */
export default function ErrorPage({ code, title, sub, action, className = '' }) {
  return (
    <div className={cn('flex min-h-[60vh] flex-col items-center justify-center px-4 text-center', className)}>
      {code && (
        <p className="mb-3 text-7xl font-extrabold tracking-tight text-border-strong select-none" aria-hidden="true">
          {code}
        </p>
      )}
      <h1 className="text-2xl font-bold text-text">{title}</h1>
      {sub && <p className="mt-2 text-base text-text-muted max-w-md">{sub}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
