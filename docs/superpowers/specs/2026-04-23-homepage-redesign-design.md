# Homepage Redesign — Design Spec

**Date:** 2026-04-23
**Branch:** feature/ui-redesign
**File:** `client/src/pages/index.js`

---

## Context

The current homepage is a minimal centered hero (badge + h1 + subtitle + buttons) with 3 generic feature cards below. It lacks visual identity and personality. This spec describes a redesign that adds a strong Epitech blue hero while keeping the page lightweight for returning students who navigate through quickly.

---

## Goals

- Give the page a strong visual identity aligned with the Epitech blue already used in the header/footer
- Provide a brief, clear explanation of the platform for new students
- Keep the fast path to the dashboard for returning users
- Adapt correctly to both light and dark mode using existing CSS token system

---

## Design

### Layout

Two sections stacked vertically:

1. **Hero section** — Epitech blue gradient, full width
2. **Features section** — adapts to theme (dark bg in dark mode, white in light mode)

### Hero section

- Background: `bg-gradient-to-br from-blue-800 via-blue-600 to-slate-900` (matches the dark header's `bg-blue-600`)
- Badge: `✦ Epitech Nice` — small pill with white/10 bg and white/20 border
- Heading: `La plateforme des projets Epitech.` — white, `text-3xl font-black`, tight tracking
- Subtitle: `Soumettez et gérez vos demandes de projets hub, workshops et Simulated.` — white/60, `text-base`
- CTAs (auth-dependent):
  - **Authenticated:** `Accéder à mon tableau de bord` (primary white button) + `Soumettre un nouveau projet` (ghost) + `Comprendre la planification projet` (ghost, link to /glossaire)
  - **Not authenticated:** `Connexion Microsoft` (primary white button)

The hero is identical in light and dark mode — it has its own blue background, not tied to `--bg`.

### Features section

- Background: `bg-bg` (uses CSS token — automatically `#12182a` in dark, `#ffffff` in light)
- Eyebrow label: `La plateforme en quelques mots` — `text-xs uppercase tracking-widest text-text-muted`
- 3 feature rows, each with:
  - Icon box: `w-9 h-9 rounded-xl` with colored tinted bg (`bg-primary/10`, `bg-emerald-500/10`, `bg-violet-500/10`)
  - SVG filled icon: colored to match tint (`text-primary`, `text-emerald-400`, `text-violet-400`) — adjusted saturation for light mode via dark: prefix
  - Title: `font-semibold text-text`
  - Description: `text-sm text-text-muted`
  - Divider: `border-b border-border` except on last row

**Feature rows (exact copy):**

| Icon | Title | Description |
|------|-------|-------------|
| Submit/arrow SVG (blue) | Soumettre un projet | Remplissez un formulaire simple pour soumettre votre demande de projet Hub / workshop / simulated. |
| Bars/pause SVG (green) | Suivi en temps réel | Suivez l'état de vos demandes et consultez les retours des pédagos. |
| List SVG (violet) | Gestion simplifiée | Une interface intuitive pour gérer toutes vos demandes de projets. |

### Icon implementation

Use inline SVG (no external library needed — consistent with existing inline SVGs in the project). The 3 SVG paths are:
- **Submit:** `M12 2a10 10 0 100 20A10 10 0 0012 2zm1 11H7v-2h6V7l5 5-5 5v-4z`
- **Realtime:** `M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z`
- **Manage:** `M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z`

---

## Component structure

Single file edit: `client/src/pages/index.js`

No new components needed — the existing `AppHeader`, `Footer`, `Button` imports are kept. The `Badge`, `Card` imports are removed (replaced by inline markup).

---

## Light / Dark mode

| Element | Dark | Light |
|---------|------|-------|
| Hero bg | `from-blue-800 via-blue-600 to-slate-900` | Same (own bg) |
| Features bg | `#12182a` via `bg-bg` | `#ffffff` via `bg-bg` |
| Feature title | `#f8fafc` via `text-text` | `#111827` via `text-text` |
| Feature desc | `#64748b` via `text-text-muted` | `#6b7280` via `text-text-muted` |
| Dividers | `#1e2a42` via `border-border` | `#e5e7eb` via `border-border` |
| Icons (blue) | `#60a5fa` | `#2563eb` |
| Icons (green) | `#34d399` | `#059669` |
| Icons (violet) | `#a78bfa` | `#7c3aed` |

Icon color adaptation uses Tailwind's `dark:` prefix on fill classes.

---

## What is NOT changing

- `AppHeader` and `Footer` — untouched
- Auth logic (`useAuth`, `isAuthenticated`) — untouched, same conditional CTA
- Page `<Head>` meta — untouched
- Overall page shell (`min-h-screen flex flex-col`) — untouched
