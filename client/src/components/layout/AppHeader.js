import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTheme } from 'next-themes';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/cn';
import NavDropdown from '../patterns/NavDropdown';
import MobileNavPanel from './MobileNavPanel';
import SeasonalControl from '../theme/SeasonalControl';

// ── Theme toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="h-9 w-9" />;
  const isDark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-md',
        'text-text-muted hover:text-text hover:bg-surface-2',
        'transition-colors duration-150 ease-smooth',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
      )}
    >
      {isDark ? (
        // Sun
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4.5 w-4.5" aria-hidden="true">
          <circle cx="10" cy="10" r="4" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      ) : (
        // Moon
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4.5 w-4.5" aria-hidden="true">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ── Hamburger ─────────────────────────────────────────────────────────────────

function HamburgerButton({ open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
      aria-expanded={open}
      className={cn(
        'flex lg:hidden h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-md',
        'text-text-muted hover:text-text hover:bg-surface-2',
        'transition-colors duration-150 ease-smooth',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
      )}
    >
      <span className={cn('block h-px w-5 bg-current transition-transform duration-200 ease-smooth', open && 'translate-y-[7px] rotate-45')} />
      <span className={cn('block h-px w-5 bg-current transition-opacity duration-200', open && 'opacity-0')} />
      <span className={cn('block h-px w-5 bg-current transition-transform duration-200 ease-smooth', open && '-translate-y-[7px] -rotate-45')} />
    </button>
  );
}

// ── Nav link (top-level simple links) ─────────────────────────────────────────

function NavLink({ href, children }) {
  const router = useRouter();
  const active = router.asPath === href;
  return (
    <Link href={href}>
      <a className={cn(
        'text-sm font-medium px-1 py-0.5 rounded',
        'transition-colors duration-150 ease-smooth',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        active ? 'text-primary' : 'text-text-muted hover:text-text'
      )}>
        {children}
      </a>
    </Link>
  );
}

// ── AppHeader ─────────────────────────────────────────────────────────────────

export default function AppHeader() {
  const { isAuthenticated, user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const isAdmin = user?.role === 'admin';

  // Build nav sections shared between desktop dropdowns and mobile panel
  const soumettreDesktop = [
    {
      label: 'Projets',
      items: [
        { label: 'Liste des projets', href: '/dashboard' },
        { label: 'Soumettre un projet', href: '/submit-project' },
        ...(isAdmin ? [{ label: 'Admin projets', href: '/admin/dashboard' }] : []),
      ],
    },
    {
      label: 'Workshops',
      items: [
        { label: 'Liste des workshops', href: '/workshops/dashboard' },
        { label: 'Soumettre un workshop', href: '/submit-workshop' },
        ...(isAdmin ? [{ label: 'Admin workshops', href: '/admin/workshops/dashboard' }] : []),
      ],
    },
    {
      label: 'Simulated',
      items: [
        { label: 'Choisir un projet', href: '/simulated' },
        { label: 'Mes projets', href: '/simulated/mes-projets' },
        ...(isAdmin ? [{ label: 'Admin Simulated', href: '/admin/simulated' }] : []),
      ],
    },
  ];

  const hubDesktop = [
    {
      label: null,
      items: [
        { label: 'Inventaire', href: '/inventory' },
        ...(isAdmin ? [{ label: "Gérer l'inventaire", href: '/admin/inventory' }] : []),
      ],
    },
  ];

  // Mobile panel flattens all sections with labels
  const mobileSections = isAuthenticated
    ? [
        {
          label: 'Projets',
          items: [
            { label: 'Liste des projets', href: '/dashboard' },
            { label: 'Soumettre un projet', href: '/submit-project' },
            ...(isAdmin ? [{ label: 'Admin projets', href: '/admin/dashboard' }] : []),
          ],
        },
        {
          label: 'Workshops',
          items: [
            { label: 'Liste des workshops', href: '/workshops/dashboard' },
            { label: 'Soumettre un workshop', href: '/submit-workshop' },
            ...(isAdmin ? [{ label: 'Admin workshops', href: '/admin/workshops/dashboard' }] : []),
          ],
        },
        {
          label: 'Simulated',
          items: [
            { label: 'Choisir un projet', href: '/simulated' },
            { label: 'Mes projets', href: '/simulated/mes-projets' },
            ...(isAdmin ? [{ label: 'Admin Simulated', href: '/admin/simulated' }] : []),
          ],
        },
        {
          label: 'Hub',
          items: [
            { label: 'Inventaire', href: '/inventory' },
            ...(isAdmin ? [{ label: "Gérer l'inventaire", href: '/admin/inventory' }] : []),
            { label: 'Glossaire', href: '/glossaire' },
          ],
        },
      ]
    : [];

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6">
          {/* Logo — left */}
          <div className="flex flex-1 items-center">
            <Link href="/">
              <a className="flex shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded">
                <img
                  src="/images/logo-dark-mode-hub.png"
                  alt="Hub Projets"
                  className="h-8 w-auto"
                />
              </a>
            </Link>
          </div>

          {/* Desktop nav — center */}
          {!loading && isAuthenticated && (
            <nav className="hidden lg:flex items-center gap-1">
              <NavDropdown label="Soumettre un projet" sections={soumettreDesktop} />
              <NavDropdown label="Hub" sections={hubDesktop} />
              <NavLink href="/glossaire">Glossaire</NavLink>
            </nav>
          )}

          {/* Controls — right */}
          <div className="flex flex-1 items-center justify-end gap-1">
            <SeasonalControl />
            <ThemeToggle />

            {!loading && isAuthenticated && (
              <>
                {/* Desktop logout */}
                <button
                  type="button"
                  onClick={logout}
                  className={cn(
                    'hidden lg:flex items-center h-9 px-3 rounded-md text-sm font-medium',
                    'text-text-muted hover:text-text hover:bg-surface-2',
                    'transition-colors duration-150 ease-smooth',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                  )}
                >
                  Déconnexion
                </button>

                {/* Mobile hamburger */}
                <HamburgerButton open={mobileOpen} onClick={() => setMobileOpen((o) => !o)} />
              </>
            )}

            {!loading && !isAuthenticated && (
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
                className={cn(
                  'flex items-center h-9 px-3 rounded-md text-sm font-medium',
                  'bg-primary text-white hover:bg-primary-hover',
                  'transition-colors duration-150 ease-smooth',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                )}
              >
                Connexion
              </a>
            )}
          </div>
        </div>
      </header>

      {isAuthenticated && (
        <MobileNavPanel
          open={mobileOpen}
          onClose={closeMobile}
          sections={mobileSections}
        />
      )}
    </>
  );
}
