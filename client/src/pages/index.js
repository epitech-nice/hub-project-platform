import Head from "next/head";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/layout/AppHeader";
import Footer from "../components/layout/Footer";

function IconSubmit({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 11H7v-2h6V7l5 5-5 5v-4z" />
    </svg>
  );
}

function IconRealtime({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
    </svg>
  );
}

function IconManage({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
    </svg>
  );
}

const FEATURES = [
  {
    Icon: IconSubmit,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    title: "Soumettre un projet",
    desc: "Remplissez un formulaire simple pour soumettre votre demande de projet Hub / workshop / simulated.",
  },
  {
    Icon: IconRealtime,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    title: "Suivi en temps réel",
    desc: "Suivez l'état de vos demandes et consultez les retours des pédagos.",
  },
  {
    Icon: IconManage,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500 dark:text-violet-400",
    title: "Gestion simplifiée",
    desc: "Une interface intuitive pour gérer toutes vos demandes de projets.",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <Head>
        <title>Hub Projets - Accueil</title>
        <meta name="description" content="Plateforme de gestion des projets Hub" />
      </Head>

      <AppHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-br from-blue-800 via-blue-600 to-slate-900 px-4 py-16 sm:py-20">
          <div className="max-w-container mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 mb-5">
              ✦ Epitech Nice
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-3 max-w-lg">
              La plateforme des projets Epitech.
            </h1>
            <p className="text-base text-white/60 mb-8 max-w-md leading-relaxed">
              Soumettez et gérez vos demandes de projets hub, workshops et Simulated.
            </p>
            {isAuthenticated ? (
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard">
                  <a className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-blue-800 hover:bg-white/90 transition-colors">
                    Accéder à mon tableau de bord
                  </a>
                </Link>
                <Link href="/submit-project">
                  <a className="inline-flex items-center justify-center rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors">
                    Soumettre un nouveau projet
                  </a>
                </Link>
                <Link href="/glossaire">
                  <a className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                    Comprendre la planification projet
                  </a>
                </Link>
              </div>
            ) : (
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
                className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-blue-800 hover:bg-white/90 transition-colors"
              >
                Connexion Microsoft
              </a>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="bg-bg px-4 py-10">
          <div className="max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">
              La plateforme en quelques mots
            </p>
            <ul className="divide-y divide-border">
              {FEATURES.map(({ Icon, iconBg, iconColor, title, desc }) => (
                <li key={title} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-text text-sm mb-0.5">{title}</p>
                    <p className="text-sm text-text-muted leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
