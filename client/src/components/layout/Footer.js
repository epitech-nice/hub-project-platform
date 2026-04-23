export default function Footer() {
  return (
    <footer className="border-t border-blue-700/50 bg-blue-600">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <p className="text-xs text-white/70">
          &copy; {new Date().getFullYear()} Hub Projets — Epitech Nice
        </p>
        <p className="text-xs text-white/70">Tous droits réservés.</p>
      </div>
    </footer>
  );
}
