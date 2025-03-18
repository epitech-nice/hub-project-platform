// hooks/useApi.js
import { useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

export const useApi = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
  });

  // Ajouter le token d'authentification
  api.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Gérer les erreurs API
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      console.error("API Error:", error.response?.data || error.message);
      throw new Error(
        error.response?.data?.message || "Une erreur est survenue"
      );
    }
  );

  // Méthode GET
  const get = async (url, params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(url, { params });
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Méthode POST
  const post = async (url, data = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post(url, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Méthode PATCH
  const patch = async (url, data = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.patch(url, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Méthode PUT
  const put = async (url, data = {}) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.put(url, data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Méthode DELETE
  const deleteRequest = async (url) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.delete(url);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    get,
    post,
    patch,
    put,
    delete: deleteRequest,
    loading,
    error,
  };
};
