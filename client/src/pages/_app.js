// pages/_app.js
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "next-themes";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/globals.css";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import { Snowfall } from "../components/theme/Snowfall";
import { ChristmasBackground } from "../components/theme/ChristmasBackground";

function ToastWithTheme() {
  const { theme, resolvedTheme } = useTheme();
  const [toastTheme, setToastTheme] = useState("light");
  const [toastStyles, setToastStyles] = useState({});

  // Mettre à jour les styles lorsque le thème change
  useEffect(() => {
    const isDarkMode = theme === 'dark' || resolvedTheme === 'dark';
    
    setToastTheme(isDarkMode ? "dark" : "light");
    setToastStyles({
      backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
      color: isDarkMode ? '#f3f4f6' : '#1f2937',
    });
    
    console.log("Thème changé:", isDarkMode ? "dark" : "light");
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
        <Head>
          <title>Hub Projets</title>
          <meta
            name="description"
            content="Plateforme de gestion des projets Hub"
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" sizes="any" />
        </Head>
        <ChristmasBackground />
        <Component {...pageProps} />
        <Footer />
        <Snowfall />
        <ToastWithTheme />
        {/* <ToastContainer
          position="bottom-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          // Classe conditionnelle selon le thème
          theme={isDarkTheme ? "dark" : "light"}
          toastStyle={{
            color: isDarkTheme ? "#000000" : "#Ffffff",
          }}
          toastClassName={({ type }) =>
            `${
              document.documentElement.classList.contains("dark")
                ? "dark-toast"
                : ""
            } ${type}`
          }
        /> */}
      </ThemeProvider>
    </AuthProvider>
  );
}

export default MyApp;
