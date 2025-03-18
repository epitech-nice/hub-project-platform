// pages/_app.js
import React from 'react';
import Head from 'next/head';
import { AuthProvider } from '../context/AuthContext';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Head>
        <title>Hub Projets</title>
        <meta name="description" content="Plateforme de gestion des projets Hub" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
      <Footer />
    </AuthProvider>
  );
}

export default MyApp;
