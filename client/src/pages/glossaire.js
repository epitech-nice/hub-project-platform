// pages/glossaire.js
import React from "react";
import Head from "next/head";
import AppHeader from "../components/layout/AppHeader";
import Footer from "../components/layout/Footer";
import PageHead from "../components/ui/PageHead";

export default function Glossaire() {
  return (
    <div className="min-h-screen bg-bg">
      <Head>
        <title>Glossaire - Hub Projets</title>
        <meta
          name="description"
          content="Glossaire des termes Scrum Agile pour les projets Hub"
        />
      </Head>

      <AppHeader />

      <main className="container mx-auto px-4 py-10 max-w-container">
        <PageHead
          title="Glossaire Scrum Agile"
          sub="Ce glossaire vous aide à comprendre les concepts clés de la méthodologie Scrum Agile"
          border
        />

        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-10 mt-8">
          {/* Left column: sections */}
          <div>
            {/* Mobile accordion TOC — visible only < lg */}
            <details className="lg:hidden mb-8 bg-surface border border-border rounded-lg">
              <summary className="px-4 py-3 text-sm font-medium cursor-pointer">Sommaire</summary>
              <nav className="px-4 pb-4 space-y-1">
                <a href="#user-story" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">User Story</a>
                <a href="#sizing" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">Sizing</a>
                <a href="#man-day" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">Man-day</a>
                <a href="#github-projects" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">GitHub Projects</a>
                <a href="#ressources" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">Ressources</a>
              </nav>
            </details>

            {/* User Story Section */}
            <section id="user-story" className="scroll-mt-24 bg-surface border border-border rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-primary">
                User Story (US)
              </h2>

              <div className="space-y-4 text-text-muted">
                <p>
                  Une <strong>User Story</strong> (histoire utilisateur) est une description simple et concise
                  d'une fonctionnalité du point de vue de l'utilisateur final. Elle suit généralement le format :
                </p>

                <div className="bg-primary-ghost border-l-4 border-primary-border p-4 rounded-r-md text-sm my-4">
                  <p className="font-mono text-sm">
                    <strong>En tant que</strong> [type d'utilisateur],<br />
                    <strong>Je veux</strong> [action/fonctionnalité],<br />
                    <strong>Afin de</strong> [bénéfice/valeur]
                  </p>
                </div>

                <p><strong>Exemple :</strong></p>
                <div className="bg-surface-2 border border-border p-4 rounded-md">
                  <p className="italic">
                    "En tant qu'étudiant, je veux pouvoir soumettre un projet Hub via un formulaire en ligne,
                    afin de gagner du temps et d'avoir un suivi de ma demande."
                  </p>
                </div>

                <div className="mt-4">
                  <p><strong>Caractéristiques d'une bonne User Story :</strong></p>
                  <ul className="list-disc list-inside ml-4 mt-2 space-y-2">
                    <li><strong>I</strong>ndépendante : Peut être développée séparément</li>
                    <li><strong>N</strong>égociable : Les détails peuvent être discutés</li>
                    <li><strong>V</strong>alorisée : Apporte de la valeur à l'utilisateur</li>
                    <li><strong>E</strong>stimable : On peut estimer l'effort nécessaire</li>
                    <li><strong>S</strong>uffisamment petite (Small) : Réalisable en un sprint</li>
                    <li><strong>T</strong>estable : On peut vérifier qu'elle fonctionne</li>
                  </ul>
                </div>

                <div className="mt-4 bg-[rgb(var(--status-changes-bg))] text-[rgb(var(--status-changes-text))] border-l-4 border-amber-400 p-4 rounded-r-md text-sm">
                  <p>
                    <strong>💡 Conseil :</strong> Dans GitHub Projects, créez une issue pour chaque User Story
                    et utilisez des labels pour les catégoriser (frontend, backend, documentation, etc.).
                  </p>
                </div>
              </div>
            </section>

            {/* Sizing Section */}
            <section id="sizing" className="scroll-mt-24 bg-surface border border-border rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-primary">
                Sizing (Estimation)
              </h2>

              <div className="space-y-4 text-text-muted">
                <p>
                  Le <strong>sizing</strong> (ou estimation) est le processus d'évaluation de la complexité
                  et de l'effort nécessaire pour réaliser une User Story.
                </p>

                <div className="mt-4">
                  <p><strong>Méthodes courantes :</strong></p>

                  <div className="mt-4 space-y-4">
                    <div className="border-l-4 border-primary pl-4">
                      <h3 className="font-bold mb-2">1. Story Points</h3>
                      <p className="mb-2">
                        Unité abstraite basée sur la complexité, l'effort et l'incertitude.
                        Utilise souvent la suite de Fibonacci : 1, 2, 3, 5, 8, 13, 21...
                      </p>
                      <ul className="list-disc list-inside ml-4 space-y-1 text-sm">
                        <li>1-2 points : Tâche très simple (quelques heures)</li>
                        <li>3-5 points : Tâche moyenne (1-2 jours)</li>
                        <li>8-13 points : Tâche complexe (3-5 jours)</li>
                        <li>21+ points : Trop complexe, à découper</li>
                      </ul>
                    </div>

                    <div className="border-l-4 border-primary pl-4">
                      <h3 className="font-bold mb-2">2. T-Shirt Sizing</h3>
                      <p className="mb-2">
                        Estimation simplifiée utilisant des tailles de vêtements :
                      </p>
                      <ul className="list-disc list-inside ml-4 space-y-1 text-sm">
                        <li><strong>XS</strong> : Très petit (moins d'une heure)</li>
                        <li><strong>S</strong> : Petit (quelques heures)</li>
                        <li><strong>M</strong> : Moyen (1-2 jours)</li>
                        <li><strong>L</strong> : Grand (3-5 jours)</li>
                        <li><strong>XL</strong> : Très grand (1-2 semaines)</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-[rgb(var(--status-changes-bg))] text-[rgb(var(--status-changes-text))] border-l-4 border-amber-400 p-4 rounded-r-md text-sm">
                  <p>
                    <strong>💡 Conseil :</strong> Dans GitHub Projects, ajoutez un champ personnalisé "Size"
                    ou utilisez des labels (XS, S, M, L, XL) pour indiquer la taille de chaque tâche.
                  </p>
                </div>

                <div className="mt-4 bg-primary-ghost border-l-4 border-primary-border p-4 rounded-r-md text-sm">
                  <p>
                    <strong>⚠️ Important :</strong> Le sizing est relatif à votre équipe.
                    Une tâche "M" pour une équipe peut être "L" pour une autre.
                    L'important est la cohérence au sein de votre projet.
                  </p>
                </div>
              </div>
            </section>

            {/* Man-day Section */}
            <section id="man-day" className="scroll-mt-24 bg-surface border border-border rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-primary">
                Sizing Man-day (Jour-homme)
              </h2>

              <div className="space-y-4 text-text-muted">
                <p>
                  Un <strong>man-day</strong> (ou jour-homme) représente la quantité de travail
                  qu'une personne peut accomplir en une journée de travail.
                </p>

                <div className="bg-primary-ghost border-l-4 border-primary-border p-4 rounded-r-md text-sm my-4">
                  <p className="font-semibold">
                    1 man-day = 1 personne × 1 jour de travail
                  </p>
                </div>

                <div className="mt-4">
                  <p><strong>Calculs et exemples :</strong></p>

                  <div className="mt-4 space-y-3">
                    <div className="bg-surface-2 border border-border p-4 rounded-md">
                      <p className="font-semibold mb-2">Exemple 1 : Travail individuel</p>
                      <p className="text-sm">
                        Une tâche estimée à <strong>3 man-days</strong> prendra 3 jours
                        si elle est réalisée par 1 personne.
                      </p>
                    </div>

                    <div className="bg-surface-2 border border-border p-4 rounded-md">
                      <p className="font-semibold mb-2">Exemple 2 : Travail en équipe</p>
                      <p className="text-sm">
                        Une tâche estimée à <strong>6 man-days</strong> peut théoriquement être réalisée en :
                      </p>
                      <ul className="list-disc list-inside ml-4 mt-2 text-sm space-y-1">
                        <li>6 jours par 1 personne</li>
                        <li>3 jours par 2 personnes</li>
                        <li>2 jours par 3 personnes</li>
                      </ul>
                    </div>

                    <div className="bg-surface-2 border border-border p-4 rounded-md">
                      <p className="font-semibold mb-2">Exemple 3 : Projet Hub</p>
                      <p className="text-sm">
                        Projet avec 3 étudiants, durée de 2 semaines (10 jours ouvrés) :
                      </p>
                      <p className="text-sm mt-2">
                        <strong>Capacité totale :</strong> 3 personnes × 10 jours = <strong>30 man-days</strong>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-[rgb(var(--status-rejected-bg))] border-l-4 border-danger p-4 rounded-r-md text-sm text-[rgb(var(--status-rejected-text))]">
                  <p>
                    <strong>⚠️ Loi de Brooks :</strong> "Ajouter des personnes à un projet en retard
                    le retarde encore plus." Les man-days ne sont pas toujours divisibles linéairement
                    car la communication et la coordination prennent du temps.
                  </p>
                </div>

                <div className="mt-4">
                  <p><strong>Conversion approximative :</strong></p>
                  <div className="bg-surface-2 border border-border p-4 rounded-md mt-2">
                    <ul className="space-y-2 text-sm">
                      <li><strong>1 man-day</strong> ≈ 6-8 heures de travail effectif</li>
                      <li><strong>1 man-week</strong> ≈ 5 man-days (semaine de travail)</li>
                      <li><strong>1 man-month</strong> ≈ 20 man-days (mois de travail)</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 bg-[rgb(var(--status-changes-bg))] text-[rgb(var(--status-changes-text))] border-l-4 border-amber-400 p-4 rounded-r-md text-sm">
                  <p>
                    <strong>💡 Conseil pour GitHub Projects :</strong> Utilisez les man-days pour estimer
                    le temps total nécessaire dans la description de vos issues. Exemple : "Estimation : 2 man-days"
                  </p>
                </div>
              </div>
            </section>

            {/* GitHub Projects Integration Section */}
            <section id="github-projects" className="scroll-mt-24 bg-surface-2 border border-border rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-primary">
                Intégration avec GitHub Projects
              </h2>

              <div className="space-y-4 text-text-muted">
                <p>
                  Pour organiser votre projet Hub avec GitHub Projects, suivez ces recommandations :
                </p>

                <div className="space-y-3 mt-4">
                  <div className="bg-surface border border-border p-4 rounded-md">
                    <h3 className="font-bold mb-2">1. Créez des Issues pour chaque User Story</h3>
                    <p className="text-sm">
                      Utilisez le format US dans le titre et la description de l'issue.
                    </p>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-md">
                    <h3 className="font-bold mb-2">2. Ajoutez des Labels</h3>
                    <p className="text-sm">
                      Exemples : <span className="font-mono bg-surface-2 border border-border px-2 py-0.5 rounded text-xs">frontend</span>,
                      {' '}<span className="font-mono bg-surface-2 border border-border px-2 py-0.5 rounded text-xs">backend</span>,
                      {' '}<span className="font-mono bg-surface-2 border border-border px-2 py-0.5 rounded text-xs">size:M</span>,
                      {' '}<span className="font-mono bg-surface-2 border border-border px-2 py-0.5 rounded text-xs">3-points</span>
                    </p>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-md">
                    <h3 className="font-bold mb-2">3. Utilisez un Project Board</h3>
                    <p className="text-sm">
                      Colonnes suggérées : <strong>Backlog</strong>, <strong>To Do</strong>,
                      {' '}<strong>In Progress</strong>, <strong>Review</strong>, <strong>Done</strong>
                    </p>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-md">
                    <h3 className="font-bold mb-2">4. Ajoutez des Estimations</h3>
                    <p className="text-sm">
                      Dans la description de chaque issue, indiquez le sizing (points ou man-days)
                      et assignez les personnes responsables.
                    </p>
                  </div>

                  <div className="bg-surface border border-border p-4 rounded-md">
                    <h3 className="font-bold mb-2">5. Suivez l'Avancement</h3>
                    <p className="text-sm">
                      Déplacez les issues entre les colonnes au fur et à mesure de la progression.
                      Utilisez les milestones pour organiser votre travail par sprint ou itération.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Resources Section */}
            <section id="ressources" className="scroll-mt-24 bg-surface border border-border rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-primary">
                Ressources Complémentaires
              </h2>

              <div className="space-y-3 text-text-muted">
                <div>
                  <h3 className="font-bold mb-2">Documentation officielle :</h3>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-sm">
                    <li>
                      <a
                        href="https://docs.github.com/en/issues/planning-and-tracking-with-projects"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        GitHub Projects Documentation
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://www.atlassian.com/agile/project-management/estimation"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Atlassian - Estimation Guide
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          {/* Right column: sticky TOC — visible only lg+ */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1" aria-label="Sommaire">
              <p className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">Sommaire</p>
              <a href="#user-story" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">User Story</a>
              <a href="#sizing" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">Sizing</a>
              <a href="#man-day" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">Man-day</a>
              <a href="#github-projects" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">GitHub Projects</a>
              <a href="#ressources" className="block text-sm text-text-muted hover:text-primary py-1 transition-colors">Ressources</a>
            </nav>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
