import { useId, useState } from 'react';
import FileInput from '../ui/FileInput';
import { FILE_RULES, checkFile } from '../../lib/ideation';

/**
 * IdeaFileField — FileInput avec les règles du module (extension et taille, comme le serveur).
 * Un fichier refusé vide le champ (remontage via `key`) et affiche le message sous la zone.
 *
 * Props: kind ('logo' | 'deck'), label, required, disabled, onChange(File | null), resetKey
 *        (changer cette valeur vide le champ après un envoi réussi).
 */
export default function IdeaFileField({ kind, label, required = false, disabled = false, onChange, resetKey = 0 }) {
  const id = useId();
  const rules = FILE_RULES[kind];
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const handleChange = (file) => {
    if (!file) {
      onChange?.(null);
      return;
    }
    const message = checkFile(file, kind);
    if (message) {
      setError(message);
      setAttempt((n) => n + 1);
      onChange?.(null);
      return;
    }
    setError(null);
    onChange?.(file);
  };

  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="flex flex-col gap-1.5">
      <p id={`${id}-label`} className="text-sm font-medium text-text">
        {label}
        {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (obligatoire)</span>}
      </p>
      {disabled ? (
        <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
          Dépôt fermé.
        </p>
      ) : (
        <FileInput
          key={`${resetKey}-${attempt}`}
          accept={rules.accept}
          onChange={handleChange}
        />
      )}
      <p id={`${id}-hint`} className="text-xs text-text-dim">{rules.label}</p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
