// components/layout/Header.js
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { ThemeSwitcher } from '../theme/ThemeSwitcher';
import { ChristmasToggle } from '../theme/ChristmasToggle';

const Header = () => {
  const { isAuthenticated, user, loading, logout } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);
  const [workshopsMenuOpen, setWorkshopsMenuOpen] = useState(false);

  // Fonction pour gérer la taille de l'écran
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    // Vérification initiale
    checkScreenSize();
    
    // Ajouter l'écouteur d'événement
    window.addEventListener('resize', checkScreenSize);
    
    // Nettoyer l'écouteur d'événement
    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Fermer le menu mobile lors de la navigation
  useEffect(() => {
    setIsMenuOpen(false);
    setProjectsMenuOpen(false);
    setWorkshopsMenuOpen(false);
  }, [router.pathname]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleProjectsMenu = () => {
    setProjectsMenuOpen(!projectsMenuOpen);
    if (!projectsMenuOpen && workshopsMenuOpen) {
      setWorkshopsMenuOpen(false);
    }
  };

  const toggleWorkshopsMenu = () => {
    setWorkshopsMenuOpen(!workshopsMenuOpen);
    if (!workshopsMenuOpen && projectsMenuOpen) {
      setProjectsMenuOpen(false);
    }
  };

  // Vérifier si la route actuelle appartient à la section Projets
  const isProjectsRoute = () => {
    return router.pathname === "/dashboard" || 
           router.pathname === "/submit-project" || 
           router.pathname === "/admin/dashboard";
  };

  // Vérifier si la route actuelle appartient à la section Workshops
  const isWorkshopsRoute = () => {
    return router.pathname === "/workshops/dashboard" || 
           router.pathname === "/submit-workshop" || 
           router.pathname === "/admin/workshops/dashboard";
  };

  if (loading) {
    return (
      <header className="bg-blue-600 dark:bg-gray-800 christmas:bg-christmas-red text-white shadow-md transition-colors duration-300">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/">
              <a className="flex items-center">
                <img 
                  src="/images/logo-dark-mode-hub.png"
                  alt="Hub Projets Logo" 
                  className="h-10 w-auto" 
                />
              </a>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-4">Chargement...</div>
            <ChristmasToggle />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
    );
  }

  // Icône de flèche pour indiquer un menu déroulant
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

  // Composant pour le menu Projets
  const ProjectsMenu = () => (
    <>
      <button 
        onClick={toggleProjectsMenu}
        className={`flex items-center py-2 lg:py-0 hover:text-blue-200 dark:hover:text-blue-300 ${
          isProjectsRoute() ? "text-blue-200 dark:text-blue-300 font-medium" : ""
        }`}
        aria-expanded={projectsMenuOpen}
      >
        Projets
        <DropdownArrow isOpen={projectsMenuOpen} />
      </button>
      
      <ul className={`${projectsMenuOpen ? 'block' : 'hidden'} lg:absolute lg:bg-blue-700 lg:dark:bg-gray-700 christmas:lg:bg-christmas-green lg:mt-2 lg:py-2 lg:rounded-md lg:shadow-lg lg:min-w-[200px] lg:z-10 pl-4 lg:pl-0 transition-colors duration-300`}>
        <li>
          <Link href="/dashboard">
            <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
              router.pathname === "/dashboard" ? "bg-blue-800 dark:bg-gray-600" : ""
            }`}>
              Liste des projets
            </a>
          </Link>
        </li>
        <li>
          <Link href="/submit-project">
            <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
              router.pathname === "/submit-project" ? "bg-blue-800 dark:bg-gray-600" : ""
            }`}>
              Soumettre un projet
            </a>
          </Link>
        </li>
        {user?.role === "admin" && (
          <li>
            <Link href="/admin/dashboard">
              <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
                router.pathname === "/admin/dashboard" ? "bg-blue-800 dark:bg-gray-600" : ""
              }`}>
                Admin projets
              </a>
            </Link>
          </li>
        )}
      </ul>
    </>
  );

  // Composant pour le menu Workshops
  const WorkshopsMenu = () => (
    <>
      <button 
        onClick={toggleWorkshopsMenu} 
        className={`flex items-center py-2 lg:py-0 hover:text-blue-200 dark:hover:text-blue-300 ${
          isWorkshopsRoute() ? "text-blue-200 dark:text-blue-300 font-medium" : ""
        }`}
        aria-expanded={workshopsMenuOpen}
      >
        Workshops
        <DropdownArrow isOpen={workshopsMenuOpen} />
      </button>
      
      <ul className={`${workshopsMenuOpen ? 'block' : 'hidden'} lg:absolute lg:bg-blue-700 lg:dark:bg-gray-700 christmas:lg:bg-christmas-green lg:mt-2 lg:py-2 lg:rounded-md lg:shadow-lg lg:min-w-[200px] lg:z-10 pl-4 lg:pl-0 transition-colors duration-300`}>
        <li>
          <Link href="/workshops/dashboard">
            <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
              router.pathname === "/workshops/dashboard" ? "bg-blue-800 dark:bg-gray-600" : ""
            }`}>
              Liste des workshops
            </a>
          </Link>
        </li>
        <li>
          <Link href="/submit-workshop">
            <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
              router.pathname === "/submit-workshop" ? "bg-blue-800 dark:bg-gray-600" : ""
            }`}>
              Soumettre un workshop
            </a>
          </Link>
        </li>
        {user?.role === "admin" && (
          <li>
            <Link href="/admin/workshops/dashboard">
              <a className={`block py-2 px-4 hover:bg-blue-800 dark:hover:bg-gray-600 ${
                router.pathname === "/admin/workshops/dashboard" ? "bg-blue-800 dark:bg-gray-600" : ""
              }`}>
                Admin workshops
              </a>
            </Link>
          </li>
        )}
      </ul>
    </>
  );

  // Composant pour l'icône du burger menu
  const BurgerIcon = () => (
    <button 
      onClick={toggleMenu} 
      className="lg:hidden flex flex-col justify-center items-center w-8 h-8"
      aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
    >
      <span className={`block w-6 h-0.5 bg-white mb-1.5 transition-transform duration-300 ${isMenuOpen ? 'transform rotate-45 translate-y-2' : ''}`}></span>
      <span className={`block w-6 h-0.5 bg-white mb-1.5 transition-opacity duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}></span>
      <span className={`block w-6 h-0.5 bg-white transition-transform duration-300 ${isMenuOpen ? 'transform -rotate-45 -translate-y-2' : ''}`}></span>
    </button>
  );

  return (
    <header className="bg-blue-600 dark:bg-gray-800 christmas:bg-christmas-red text-white shadow-md transition-colors duration-300">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/">
              <a className="flex items-center">
                <img 
                  src="/images/logo-dark-mode-hub.png"
                  alt="Hub Projets Logo" 
                  className="h-10 w-auto" 
                />
              </a>
            </Link>
          </div>
          
          <div className="flex items-center">
            {/* Navigation pour grands écrans - à côté du dark mode */}
            <nav className="hidden lg:block mr-6">
              <ul className="flex items-center space-x-6">
                {isAuthenticated ? (
                  <>
                    <li className="relative">
                      <ProjectsMenu />
                    </li>
                    <li className="relative">
                      <WorkshopsMenu />
                    </li>
                    <li>
                      <button 
                        onClick={logout} 
                        className="hover:text-blue-200 dark:hover:text-blue-300"
                      >
                        Déconnexion
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
                      className="hover:text-blue-200 dark:hover:text-blue-300"
                    >
                      Connexion
                    </a>
                  </li>
                )}
              </ul>
            </nav>
            
            {/* Burger menu pour mobile */}
            {isMobile && <BurgerIcon />}

            {/* Theme switchers */}
            <div className="ml-4 flex items-center gap-2">
              <ChristmasToggle />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
        
        {/* Menu mobile */}
        <nav className={`lg:hidden ${isMenuOpen ? 'block' : 'hidden'} mt-4 transition-all duration-300`}>
          <ul className="flex flex-col space-y-3 border-t border-blue-500 dark:border-gray-700 pt-3">
            {isAuthenticated ? (
              <>
                <li className="relative">
                  <ProjectsMenu />
                </li>
                <li className="relative mt-2">
                  <WorkshopsMenu />
                </li>
                <li className="mt-2">
                  <button 
                    onClick={logout} 
                    className="w-full text-left py-2 hover:text-blue-200 dark:hover:text-blue-300"
                  >
                    Déconnexion
                  </button>
                </li>
              </>
            ) : (
              <li>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
                  className="block py-2 hover:text-blue-200 dark:hover:text-blue-300"
                >
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