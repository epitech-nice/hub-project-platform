import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../../../components/layout/Header';
import { useAuth } from '../../../context/AuthContext';
import { useApi } from '../../../hooks/useApi';

export default function ScanPage() {
  const router = useRouter();
  const { id } = router.query;
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { get, post, loading: apiLoading } = useApi();

  const [tool, setTool] = useState(null);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeLoans, setActiveLoans] = useState([]);

  // Si on n'est pas authentifié (et que le chargement auth est fini), on redirige vers le login avec le paramètre state
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        // Redirection vers le serveur d'authentification en passant notre URL courante pour y revenir ensuite
        const returnPath = router.asPath;
        window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft?redirectTo=${encodeURIComponent(returnPath)}`;
      }
    }
  }, [isAuthenticated, authLoading, router]);

  // Chargement des données de l'outil et des emprunts de l'utilisateur
  useEffect(() => {
    if (isAuthenticated && id) {
      fetchToolData(id);
    }
  }, [isAuthenticated, id]);

  const fetchToolData = async (toolId) => {
    try {
      const res = await get(`/api/tools/${toolId}`);
      setTool(res.data);
      
      // Récupérer l'historique pour savoir si l'utilisateur en possède déjà
      fetchUserLoans(toolId);
    } catch (err) {
      setError('Outil introuvable ou erreur de chargement.');
    }
  };

  const fetchUserLoans = async (toolId) => {
    try {
      const res = await get('/api/tools/loans/history?status=borrowed');
      // On filtre pour ne garder que cet outil pour l'utilisateur connecté
      // Note: l'API /history retourne tout publiquement par défaut (selon spécification),
      // il faudra peut-être une route dédiée /me si on voulait optimiser.
      // Dans l'immédiat on filtre côté client.
      const userToolsLoans = res.data.filter(
        loan => typeof loan.tool === 'object' && loan.tool._id === toolId // Selon comment populate revoie la donnée
        // l'API retourne mongoose user peuplé. On n'a pas accès à mon user Ids pour filtrer.
      );
      // Pour être plus robuste on interrogera encore l'API mais on gèrera l'erreur lors de l'action s'il faut
    } catch(e) {
      console.error(e);
    }
  };

  const handleBorrow = async () => {
    setError('');
    setActionSuccess('');
    try {
      await post(`/api/tools/${id}/borrow`, { quantity });
      setActionSuccess(`${quantity} exemplaire(s) emprunté(s) avec succès !`);
      fetchToolData(id); // reload stock
      setQuantity(1);
    } catch (err) {
      setError(err.message || "Erreur lors de l'emprunt");
    }
  };

  const handleReturn = async () => {
    setError('');
    setActionSuccess('');
    try {
      await post(`/api/tools/${id}/return`, { quantity });
      setActionSuccess(`${quantity} exemplaire(s) rendu(s) avec succès !`);
      fetchToolData(id); // reload stock
      setQuantity(1);
    } catch (err) {
      setError(err.message || "Erreur lors du retour");
    }
  };

  if (authLoading || !isAuthenticated) {
    return <div className="text-center py-10 dark:text-white">Redirection vers l'authentification...</div>;
  }

  if (apiLoading && !tool && !error) {
    return <div className="text-center py-10 dark:text-white">Chargement...</div>;
  }

  if (error && !tool) {
    return (
      <div className="min-h-screen dark:bg-gray-900">
        <Header />
         <div className="container mx-auto px-4 py-8 text-center text-red-500">
            {error}
         </div>
      </div>
    );
  }

  if (!tool) return null;

  const availableQuantity = tool.quantity - tool.borrowedCount;
  const isMaintenance = tool.status === 'maintenance';

  return (
    <div className="min-h-screen dark:bg-gray-900">
      <Head>
        <title>Scan - {tool.name}</title>
      </Head>
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-lg">
        <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden p-6 mx-auto mt-10">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold dark:text-white">{tool.name}</h1>
            {tool.tags && tool.tags.length > 0 && (
              <div className="flex justify-center flex-wrap gap-2 mt-3">
                 {tool.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {tag}
                    </span>
                 ))}
              </div>
            )}
          </div>

          <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
            {tool.description}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
             <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <span className="block text-sm text-gray-500 dark:text-gray-400">Stock disponible</span>
                <span className="block text-2xl font-bold dark:text-white">{availableQuantity}</span>
             </div>
             <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <span className="block text-sm text-gray-500 dark:text-gray-400">Limite / utilisateur</span>
                <span className="block text-2xl font-bold dark:text-white">{tool.maxBorrowPerUser || '∞'}</span>
             </div>
             {tool.currentUserBorrowCount > 0 && (
               <div className="col-span-2 bg-blue-100 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                  <span className="block text-sm text-blue-600 dark:text-blue-300 font-semibold mb-1">Votre emprunt actuel</span>
                  <span className="block text-3xl font-extrabold text-blue-700 dark:text-blue-200">{tool.currentUserBorrowCount}</span>
                  {tool.maxBorrowPerUser && (
                    <span className="block text-xs text-blue-500 dark:text-blue-400 mt-2 italic">
                      Capacité d'emprunt restante : {tool.maxBorrowPerUser - tool.currentUserBorrowCount}
                    </span>
                  )}
               </div>
             )}
          </div>

          {error && <div className="mb-4 text-red-500 text-center text-sm">{error}</div>}
          {actionSuccess && <div className="mb-4 text-green-500 text-center text-sm">{actionSuccess}</div>}

          {isMaintenance ? (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg text-center">
              Cet outil est en maintenance et ne peut pas être emprunté.
            </div>
          ) : (
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-200">Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
               </div>

               <div className="flex gap-4 pt-2">
                 <button
                   onClick={handleBorrow}
                   disabled={availableQuantity === 0}
                   className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   Emprunter
                 </button>
                 <button
                   onClick={handleReturn}
                   className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg font-bold"
                 >
                   Rendre
                 </button>
               </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
