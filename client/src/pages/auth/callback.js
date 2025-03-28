// pages/auth/callback.js
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallback() {
  const router = useRouter();
  const { token, loading } = useAuth();
  
  useEffect(() => {
    // Fonction pour gérer la redirection
    const handleAuthRedirect = () => {
      if (!router.isReady) return;
      
      const { redirectTo } = router.query;
      
      // Si l'utilisateur est authentifié, rediriger vers la page appropriée
      if (!loading && token) {
        // Utiliser le chemin de redirection fourni par le serveur ou tomber sur dashboard par défaut
        router.push(redirectTo || '/dashboard');
      }
    };
    
    handleAuthRedirect();
  }, [token, loading, router, router.isReady, router.query]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-4">Authentification en cours...</h1>
        <p className="text-gray-600">Veuillez patienter pendant que nous vous connectons.</p>
        <div className="mt-6 flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </div>
    </div>
  );
}