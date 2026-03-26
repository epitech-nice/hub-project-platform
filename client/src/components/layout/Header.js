// components/layout/Header.js
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { ThemeSwitcher } from '../theme/ThemeSwitcher';
import { SpringToggle } from '../theme/SpringToggle';

const Header = () => {
  const { isAuthenticated, user, loading, logout } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen]     = useState(false);
  const [isMobile, setIsMobile]         = useState(false);
  const [submitMenuOpen, setSubmitMenuOpen] = useState(false);
  const [hubMenuOpen, setHubMenuOpen]   = useState(false);

  useEffect(() => {
    const checkScreenSize = () => setIsMobile(window.innerWidth < 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Fermer tous les menus lors de la navigation
  useEffect(() => {
    setIsMenuOpen(false);
    setSubmitMenuOpen(false);
    setHubMenuOpen(false);
  }, [router.pathname]);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const toggleSubmitMenu = () => {
    setSubmitMenuOpen(!submitMenuOpen);
    if (!submitMenuOpen) setHubMenuOpen(false);
  };

  const toggleHubMenu = () => {
    setHubMenuOpen(!hubMenuOpen);
    if (!hubMenuOpen) setSubmitMenuOpen(false);
  };

  // Détection des routes actives par catégorie
  const isSubmitRoute = () =>
    ["/dashboard", "/submit-project", "/admin/dashboard",
     "/workshops/dashboard", "/submit-workshop", "/admin/workshops/dashboard"]
      .includes(router.pathname) ||
    router.pathname.startsWith("/simulated") ||
    router.pathname.startsWith("/admin/simulated");

  const isHubRoute = () =>
    router.pathname === "/inventory" ||
    router.pathname === "/admin/inventory";

  if (loading) {
    return (
      <header className="bg-blue-600 dark:bg-gray-800 spring:bg-spring-pink text-white shadow-md transition-colors duration-300">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/"><a className="flex items-center">
              <img src="/images/logo-dark-mode-hub.png" alt="Hub Projets Logo" className="h-10 w-auto" />
            </a></Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-4">Chargement...</div>
            <SpringToggle />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
    );
  }

  // ── Composants utilitaires ────────────────────────────────────────────────
  const DropdownArrow = ({ isOpen }) => (
    <svg
      className={`ml-1 h-4 w-4 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );

  // Item de dropdown partagé
  const DropdownItem = ({ href, label }) => (
    <li>
      <Link href={href}>
        <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
          router.pathname === href ? "bg-blue-800 dark:bg-gray-600" : ""
        }`}>
          {label}
        </a>
      </Link>
    </li>
  );

  // Séparateur de section avec titre
  const SectionLabel = ({ label }) => (
    <li className="px-4 pt-3 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-blue-200 dark:text-gray-400 spring:text-spring-dark/60">
        {label}
      </span>
    </li>
  );

  const SectionDivider = () => (
    <li className="mx-2 my-1 border-t border-blue-600 dark:border-gray-600" />
  );

  // ── Menu "Soumettre un projet" (regroupe Projets + Workshops + Simulated) ──
  const SoumettreMenu = () => (
    <>
      <button
        onClick={toggleSubmitMenu}
        className={`flex items-center py-2 lg:py-0 hover:text-blue-200 dark:hover:text-blue-300 ${
          isSubmitRoute() ? "text-blue-200 dark:text-blue-300 font-medium" : ""
        }`}
        aria-expanded={submitMenuOpen}
      >
        Soumettre un projet
        <DropdownArrow isOpen={submitMenuOpen} />
      </button>

      <ul className={`${submitMenuOpen ? 'block' : 'hidden'} lg:absolute lg:bg-blue-700 lg:dark:bg-gray-700 spring:lg:bg-spring-green lg:mt-2 lg:py-2 lg:rounded-md lg:shadow-lg lg:min-w-[220px] lg:z-10 pl-4 lg:pl-0 transition-colors duration-300`}>
        {/* Section Projets */}
        <SectionLabel label="Projets" />
        <DropdownItem href="/dashboard" label="Liste des projets" />
        <DropdownItem href="/submit-project" label="Soumettre un projet" />
        {user?.role === "admin" && (
          <DropdownItem href="/admin/dashboard" label="Admin projets" />
        )}

        <SectionDivider />

        {/* Section Workshops */}
        <SectionLabel label="Workshops" />
        <DropdownItem href="/workshops/dashboard" label="Liste des workshops" />
        <DropdownItem href="/submit-workshop" label="Soumettre un workshop" />
        {user?.role === "admin" && (
          <DropdownItem href="/admin/workshops/dashboard" label="Admin workshops" />
        )}

        <SectionDivider />

        {/* Section Simulated */}
        <SectionLabel label="Simulated" />
        <DropdownItem href="/simulated" label="Choisir un projet" />
        <DropdownItem href="/simulated/mes-projets" label="Mes projets" />
        {user?.role === "admin" && (
          <DropdownItem href="/admin/simulated" label="Admin Simulated" />
        )}
      </ul>
    </>
  );

  // ── Menu "Hub" (inventaire + futurs outils du Hub) ────────────────────────
  const HubMenu = () => (
    <>
      <button
        onClick={toggleHubMenu}
        className={`flex items-center py-2 lg:py-0 hover:text-blue-200 dark:hover:text-blue-300 ${
          isHubRoute() ? "text-blue-200 dark:text-blue-300 font-medium" : ""
        }`}
        aria-expanded={hubMenuOpen}
      >
        Hub
        <DropdownArrow isOpen={hubMenuOpen} />
      </button>

      <ul className={`${hubMenuOpen ? 'block' : 'hidden'} lg:absolute lg:bg-blue-700 lg:dark:bg-gray-700 spring:lg:bg-spring-green lg:mt-2 lg:py-2 lg:rounded-md lg:shadow-lg lg:min-w-[200px] lg:z-10 pl-4 lg:pl-0 transition-colors duration-300`}>
        <DropdownItem href="/inventory" label="Inventaire" />
        {user?.role === "admin" && (
          <DropdownItem href="/admin/inventory" label="Gérer l'inventaire" />
        )}
      </ul>
    </>
  );

  // ── Burger icon ───────────────────────────────────────────────────────────
  const BurgerIcon = () => (
    <button
      onClick={toggleMenu}
      className="lg:hidden flex flex-col justify-center items-center w-8 h-8"
      aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
    >
      <span className={`block w-6 h-0.5 bg-white mb-1.5 transition-transform duration-300 ${isMenuOpen ? 'transform rotate-45 translate-y-2' : ''}`} />
      <span className={`block w-6 h-0.5 bg-white mb-1.5 transition-opacity duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`} />
      <span className={`block w-6 h-0.5 bg-white transition-transform duration-300 ${isMenuOpen ? 'transform -rotate-45 -translate-y-2' : ''}`} />
    </button>
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <header className="bg-blue-600 dark:bg-gray-800 spring:bg-spring-pink text-white shadow-md transition-colors duration-300">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/"><a className="flex items-center">
              <img src="/images/logo-dark-mode-hub.png" alt="Hub Projets Logo" className="h-10 w-auto" />
            </a></Link>
          </div>

          <div className="flex items-center">
            {/* Navigation desktop */}
            <nav className="hidden lg:block mr-6">
              <ul className="flex items-center space-x-6">
                {isAuthenticated ? (
                  <>
                    <li className="relative">
                      <SoumettreMenu />
                    </li>
                    <li className="relative">
                      <HubMenu />
                    </li>
                    <li>
                      <Link href="/glossaire">
                        <a className={`hover:text-blue-200 dark:hover:text-blue-300 ${
                          router.pathname === "/glossaire" ? "text-blue-200 dark:text-blue-300 font-medium" : ""
                        }`}>
                          Glossaire
                        </a>
                      </Link>
                    </li>
                    <li>
                      <button onClick={logout} className="hover:text-blue-200 dark:hover:text-blue-300">
                        Déconnexion
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <a href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`} className="hover:text-blue-200 dark:hover:text-blue-300">
                      Connexion
                    </a>
                  </li>
                )}
              </ul>
            </nav>

            {isMobile && <BurgerIcon />}

            <div className="ml-4 flex items-center gap-2">
              <SpringToggle />
              <ThemeSwitcher />
            </div>
          </div>
        </div>

        {/* Navigation mobile */}
        <nav className={`lg:hidden ${isMenuOpen ? 'block' : 'hidden'} mt-4 transition-all duration-300`}>
          <ul className="flex flex-col space-y-3 border-t border-blue-500 dark:border-gray-700 pt-3">
            {isAuthenticated ? (
              <>
                <li className="relative">
                  <SoumettreMenu />
                </li>
                <li className="relative mt-2">
                  <HubMenu />
                </li>
                <li className="mt-2">
                  <Link href="/glossaire">
                    <a className={`block py-2 hover:text-blue-200 dark:hover:text-blue-300 ${
                      router.pathname === "/glossaire" ? "text-blue-200 dark:text-blue-300 font-medium" : ""
                    }`}>
                      Glossaire
                    </a>
                  </Link>
                </li>
                <li className="mt-2">
                  <button onClick={logout} className="w-full text-left py-2 hover:text-blue-200 dark:hover:text-blue-300">
                    Déconnexion
                  </button>
                </li>
              </>
            ) : (
              <li>
                <a href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`} className="block py-2 hover:text-blue-200 dark:hover:text-blue-300">
                  Connexion
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
