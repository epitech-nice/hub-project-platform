export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <p className="text-xs text-text-dim">
          &copy; {new Date().getFullYear()} Hub Projets — Epitech Nice
        </p>
        <p className="text-xs text-text-dim">Tous droits réservés.</p>
      </div>
    </footer>
  );
}
