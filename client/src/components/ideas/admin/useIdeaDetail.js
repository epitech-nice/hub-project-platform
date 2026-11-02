// components/ideas/admin/useIdeaDetail.js
// Détail d'une idée (GET /api/ideas/:id) pour les dialogues staff : un admin voit
// les idées masquées, les emails, les liens avec leur _id et unlockedUntil.
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import { errorText } from '../../../lib/ideation';

export default function useIdeaDetail(ideaId, open) {
  const { get } = useApi();
  const [idea, setIdea] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const load = async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await get(`/api/ideas/${encodeURIComponent(ideaId)}`);
      if (requestId !== requestRef.current) return;
      setIdea(res.data || null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setIdea(null);
      setError(errorText(err, "Impossible de charger l'idée"));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !ideaId) {
      // Fermeture : les réponses encore en vol sont ignorées
      requestRef.current += 1;
      setIdea(null);
      setError(null);
      setLoading(false);
      return;
    }
    load();
    // get n'est pas mémorisé : load l'utilise sans être une dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId, open]);

  return { idea, setIdea, loading, error, reload: load };
}
