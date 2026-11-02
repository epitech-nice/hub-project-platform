// lib/download.js
// Téléchargements authentifiés : les fichiers d'idées ne sont jamais servis en statique,
// il faut envoyer l'en-tête Authorization (impossible avec <a href> ou <img src>).
import axios from 'axios';

// Le corps d'une erreur arrive lui aussi en Blob : on tente d'en lire le message JSON
const readBlobError = async (data) => {
  if (!data || typeof data.text !== 'function') return null;
  try {
    const parsed = JSON.parse(await data.text());
    return parsed.message || parsed.error || null;
  } catch (e) {
    return null;
  }
};

export const fetchBlob = async (path, token) => {
  try {
    const response = await axios.get(path, {
      baseURL: process.env.NEXT_PUBLIC_API_URL,
      responseType: 'blob',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return response.data;
  } catch (axiosError) {
    const status = axiosError.response?.status;
    const message = (await readBlobError(axiosError.response?.data))
      || (status === 404 ? 'Fichier introuvable' : 'Téléchargement impossible');
    const err = new Error(message);
    err.status = status;
    throw err;
  }
};

// Déclenche l'enregistrement du Blob sous le nom donné
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'fichier';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
