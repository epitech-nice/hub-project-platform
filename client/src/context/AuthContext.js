// context/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // Initialiser l'authentification au chargement
  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log("Initialisation de l'authentification");
        const storedToken = localStorage.getItem('token');
        console.log("Token dans localStorage:", storedToken ? "Présent" : "Absent");
        
        if (storedToken) {
          try {
            setToken(storedToken);
            
            // Essayer d'abord de décoder le token pour obtenir les informations de base
            try {
              const decoded = jwtDecode(storedToken);
              console.log("Token décodé:", decoded);
              // Initialiser l'utilisateur avec les informations du token
              if (decoded.id) {
                setUser({
                  _id: decoded.id,
                  name: decoded.name,
                  email: decoded.email,
                  role: decoded.role || 'student'
                });
              }
            } catch (decodeError) {
              console.error('Erreur de décodage du token:', decodeError);
            }
            
            // Ensuite, récupérer les informations complètes de l'utilisateur
            console.log("Récupération des informations utilisateur");
            const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`, {
              headers: { Authorization: `Bearer ${storedToken}` }
            });
            
            console.log("Réponse API:", response.data);
            setUser(response.data.data);
          } catch (error) {
            console.error('Erreur de chargement utilisateur:', error);
            // Nettoyer en cas d'erreur
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
          }
        } else {
          console.log("Aucun token trouvé");
        }
      } catch (e) {
        console.error("Erreur globale dans initAuth:", e);
      } finally {
        setLoading(false);
      }
    };
    
    initAuth();
  }, []);
  
  // Intercepter le token dans le callback OAuth
  useEffect(() => {
    if (router.pathname === '/auth/callback' && router.query.token) {
      const { token } = router.query;
            
      if (token) {
        localStorage.setItem('token', token);
        setToken(token);
        
        // Décodage immédiat du token pour obtenir les informations de base
        try {
          const decoded = jwtDecode(token);
          
          // Définir les informations de l'utilisateur à partir du token
          setUser({
            _id: decoded.id,
            role: decoded.role || 'student' // Valeur par défaut
          });
          
          // Récupération complète des informations utilisateur depuis l'API
          const fetchUserInfo = async () => {
            try {
              const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/users/me`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              
              setUser(response.data.data);
            } catch (error) {
              console.error('Erreur lors du chargement des informations utilisateur:', error);
            }
          };
          
          fetchUserInfo();
        } catch (decodeError) {
          console.error("Erreur lors du décodage du token:", decodeError);
        }
        
        router.push('/dashboard');
      }
    }
  }, [router.pathname, router.query, router]);
  
  // Déconnexion
  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    router.push('/');
  };
  
  // Vérifier si l'utilisateur est authentifié
  const isAuthenticated = !!token;
  
  // Vérifier si l'utilisateur est admin
  const isAdmin = user?.role === 'admin';
  
  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      isAuthenticated,
      isAdmin,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);