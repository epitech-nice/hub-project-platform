// components/layout/Header.js
import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import { ThemeSwitcher } from "../theme/ThemeSwitcher";

const Header = () => {
  const { isAuthenticated, user, loading, logout } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <header className="bg-blue-600 dark:bg-gray-800 text-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/">
              <a className="text-xl font-bold">Hub Projets</a>
            </Link>
          </div>
          <div className="flex items-center">
            <div>Chargement...</div>
            <ThemeSwitcher />
          </div>
        </div>
      </header>
    );
  } else {
    return (
      <header className="bg-blue-600 dark:bg-gray-800 text-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Link href="/">
              <a className="text-xl font-bold">Hub Projets</a>
            </Link>
          </div>

          <nav>
            <ul className="flex items-center space-x-6">
              {isAuthenticated ? (
                <>
                  <li>
                    <Link href="/dashboard">
                      <a
                        className={`hover:text-blue-200 dark:hover:text-blue-300 ${
                          router.pathname === "/dashboard" ? "underline" : ""
                        }`}
                      >
                        Tableau de bord
                      </a>
                    </Link>
                  </li>
                  <li>
                    <Link href="/submit-project">
                      <a
                        className={`hover:text-blue-200 dark:hover:text-blue-300 ${
                          router.pathname === "/submit-project"
                            ? "underline"
                            : ""
                        }`}
                      >
                        Soumettre un projet
                      </a>
                    </Link>
                  </li>
                  {user?.role === "admin" && (
                    <li>
                      <Link href="/admin/dashboard">
                        <a
                          className={`hover:text-blue-200 dark:hover:text-blue-300 ${
                            router.pathname.startsWith("/admin")
                              ? "underline"
                              : ""
                          }`}
                        >
                          Administration
                        </a>
                      </Link>
                    </li>
                  )}
                  <li>
                    <button
                      onClick={logout}
                      className="hover:text-blue-200 dark:hover:text-blue-300"
                    >
                      Déconnexion
                    </button>
                  </li>
                  <li>
                    <ThemeSwitcher />
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
                      className="hover:text-blue-200 dark:hover:text-blue-300"
                    >
                      Connexion
                    </a>
                  </li>
                  <li>
                    <ThemeSwitcher />
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </header>
    );
  }
};

export default Header;
