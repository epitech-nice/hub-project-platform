// pages/admin/print/printers/[id]/qr.js
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../../../context/AuthContext';

// Le endpoint QR exige un Bearer token (admin), non transmissible via un simple <img src>.
// On charge donc l'image nous-mêmes puis on l'affiche en object URL.
function QrImage({ qrUrl, token }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;

    fetch(qrUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Échec du chargement du QR code');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [qrUrl, token]);

  if (error) return <p className="text-sm text-red-600">Impossible de charger le QR code.</p>;
  if (!src) return <p className="text-sm text-text-muted">Chargement…</p>;
  return <img src={src} alt="QR code de libération" className="mx-auto" />;
}

export default function PrinterQrPage() {
  const router = useRouter();
  const { id } = router.query;
  const { isAuthenticated, isAdmin, token, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      router.push('/');
    }
  }, [isAuthenticated, isAdmin, authLoading, router]);

  if (authLoading || !isAuthenticated || !isAdmin || !id || !token) return null;

  const qrUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/print/printers/${id}/qr`;

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <Head>
        <title>Hub Projets - QR code imprimante</title>
      </Head>

      <h1 className="text-xl font-bold mb-6">QR code — à imprimer et coller sur l&apos;imprimante</h1>

      <QrImage qrUrl={qrUrl} token={token} />

      <Link href="/admin/print">
        <a className="inline-block mt-8 text-sm font-medium text-primary hover:underline print:hidden">
          Retour à l&apos;administration Impression 3D
        </a>
      </Link>
    </div>
  );
}
