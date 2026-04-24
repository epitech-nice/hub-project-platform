import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallback() {
  const router = useRouter();
  const { token, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (!router.isReady) return;

    // Si un fragment OAuth est présent, c'est AuthContext qui gère la redirection (ne rien faire pour éviter une race condition).
    if (typeof window !== 'undefined' && window.location.hash) return;

    // Cas edge : utilisateur déjà connecté qui arrive sur /auth/callback sans fragment.
    if (!loading && token) {
      router.push(isAdmin ? '/admin/dashboard' : '/dashboard');
    }
  }, [token, loading, isAdmin, router.isReady]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface p-8 rounded-lg shadow-md border border-border text-center">
        <h1 className="text-2xl font-bold text-text mb-4">Authentification en cours...</h1>
        <p className="text-text-muted">Veuillez patienter pendant que nous vous connectons.</p>
        <div className="mt-6 flex justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      </div>
    </div>
  );
}
