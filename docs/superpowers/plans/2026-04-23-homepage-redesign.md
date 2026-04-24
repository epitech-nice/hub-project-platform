# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal homepage with a two-section layout — Epitech blue gradient hero + themed feature list — that works in both light and dark mode.

**Architecture:** Single file rewrite of `client/src/pages/index.js`. The hero section has its own fixed blue gradient background (identical in both themes). The features section below uses `bg-bg` / `text-text` / `text-text-muted` / `border-border` CSS tokens so it adapts automatically to the active theme via next-themes.

**Tech Stack:** Next.js 12 (Pages Router), Tailwind CSS, next-themes (class strategy), inline SVG icons (no external icon library).

---

### Task 1: Rewrite `client/src/pages/index.js`

**Files:**
- Modify: `client/src/pages/index.js`

- [ ] **Step 1: Replace the file content**

```jsx
import Head from "next/head";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/layout/AppHeader";
import Footer from "../components/layout/Footer";
import Button from "../components/ui/Button";

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
    iconColor: "text-emerald-400 dark:text-emerald-400",
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
                <Button variant="primary" size="lg" as="a" href="/dashboard"
                  className="!bg-white !text-blue-800 hover:!bg-white/90 !border-transparent">
                  Accéder à mon tableau de bord
                </Button>
                <Button variant="outline" size="lg" as="a" href="/submit-project"
                  className="!border-white/30 !text-white/90 hover:!bg-white/10">
                  Soumettre un nouveau projet
                </Button>
                <Button variant="ghost" size="lg" as="a" href="/glossaire"
                  className="!text-white/70 hover:!text-white hover:!bg-white/10">
                  Comprendre la planification projet
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg"
                as="a"
                href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/microsoft`}
                className="!bg-white !text-blue-800 hover:!bg-white/90 !border-transparent">
                Connexion Microsoft
              </Button>
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
```

- [ ] **Step 2: Start the dev server and verify rendering**

```bash
cd client && npm run dev
```

Open `http://localhost:3000`. Check:
- Hero shows blue gradient background
- Badge `✦ Epitech Nice` is visible
- Heading and subtitle render correctly
- CTAs: if logged in → 3 buttons; if not → 1 button (Connexion Microsoft)
- Feature list shows 3 rows with icons, titles, descriptions

- [ ] **Step 3: Toggle dark/light mode and verify the features section adapts**

Use the theme toggle in the header. Check:
- Hero: unchanged (own bg, no adaptation needed)
- Features section background: dark → `#12182a`, light → white
- Feature titles and descriptions: contrast changes correctly
- Dividers between rows: visible in both themes

- [ ] **Step 4: Check mobile layout**

Resize browser to mobile width (~375px). Check:
- Hero padding reduces on small screens
- Buttons wrap cleanly if multiple are shown
- Feature rows don't overflow

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/index.js
git commit -m "feat(ui): redesign homepage with Epitech blue hero and feature list"
```
