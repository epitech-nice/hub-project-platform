import Head from "next/head";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/layout/AppHeader";
import Footer from "../components/layout/Footer";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <Head>
        <title>Hub Projets - Accueil</title>
        <meta
          name="description"
          content="Plateforme de gestion des projets Hub"
        />
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-container">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-4">
            <Badge variant="neutral">Epitech Nice</Badge>
          </div>

          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Bienvenue sur le Hub Projets
          </h1>
          <p className="text-xl text-text-muted mb-8">
            Soumettez et gérez vos demandes de projets facilement
          </p>

          {isAuthenticated ? (
            <div className="flex flex-wrap justify-center gap-4">
              <Button variant="primary" size="lg" as="a" href="/dashboard">
                Accéder à mon tableau de bord
              </Button>
              <Button variant="outline" size="lg" as="a" href="/submit-project">
                Soumettre un nouveau projet
              </Button>
              <Button variant="ghost" size="lg" as="a" href="/glossaire">
                Comprendre la planification projet
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              as="a"
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
            >
              Connexion Microsoft
            </Button>
          )}
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-6">
          <Card>
            <h3 className="text-xl font-bold mb-3">Soumettre un projet</h3>
            <p className="text-text-muted">
              Remplissez un formulaire simple pour soumettre votre demande de
              projet Hub.
            </p>
          </Card>

          <Card>
            <h3 className="text-xl font-bold mb-3">Suivi en temps réel</h3>
            <p className="text-text-muted">
              Suivez l'état de vos demandes et consultez les retours des
              administrateurs.
            </p>
          </Card>

          <Card>
            <h3 className="text-xl font-bold mb-3">Gestion simplifiée</h3>
            <p className="text-text-muted">
              Une interface intuitive pour gérer toutes vos demandes de projets.
            </p>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
