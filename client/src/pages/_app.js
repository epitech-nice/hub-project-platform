import React, { useEffect, useState } from "react";
import Head from "next/head";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "next-themes";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/globals.css";
import SeasonalLayer from "../components/layout/SeasonalLayer";

function ToastWithTheme() {
  const { theme, resolvedTheme } = useTheme();
  const [toastTheme, setToastTheme] = useState("light");
  const [toastStyles, setToastStyles] = useState({});

  useEffect(() => {
    const isDarkMode = theme === 'dark' || resolvedTheme === 'dark';
    setToastTheme(isDarkMode ? "dark" : "light");
    setToastStyles({
      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
      color: isDarkMode ? '#f3f4f6' : '#1f2937',
    });
  }, [theme, resolvedTheme]);

  return (
    <ToastContainer
      position="top-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={toastTheme}
      toastStyle={toastStyles}
    />
  );
}

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <ThemeProvider attribute="class">
        <div className="font-sans">
          <Head>
            <title>Hub Projets</title>
            <meta name="description" content="Plateforme de gestion des projets Hub" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.ico" sizes="any" />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
              href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap"
              rel="stylesheet"
            />
          </Head>
          <SeasonalLayer />
          <Component {...pageProps} />
          <ToastWithTheme />
        </div>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default MyApp;
