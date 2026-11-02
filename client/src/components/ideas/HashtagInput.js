import { useEffect, useId, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { cn } from '../../lib/cn';
import { normalizeHashtag, MIN_HASHTAGS } from '../../lib/ideation';

/**
 * HashtagInput — saisie de hashtags avec auto-complétion (/api/ideas/hashtags).
 * Entrée, virgule ou espace ajoutent le hashtag ; Retour arrière sur un champ vide retire le dernier.
 *
 * Props: value (string[] normalisés), onChange(string[]), label, disabled, min (défaut 3),
 *        showCounter (défaut true), placeholder.
 */
export default function HashtagInput({
  value = [],
  onChange,
  label = 'Hashtags',
  disabled = false,
  min = MIN_HASHTAGS,
  showCounter = true,
  placeholder = 'Ex. ia, sante, mobilite',
}) {
  const { get } = useApi();
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const requestRef = useRef(0);

  const prefix = normalizeHashtag(text);

  // Suggestions : préfixe normalisé, anti-rebond 250 ms, réponses périmées ignorées
  useEffect(() => {
    if (!prefix || disabled) {
      setSuggestions([]);
      return undefined;
    }
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await get('/api/ideas/hashtags', { prefix });
        if (requestId !== requestRef.current) return;
        const list = Array.isArray(res.data) ? res.data.filter((t) => !value.includes(t)) : [];
        setSuggestions(list);
        setActive(-1);
      } catch (e) {
        if (requestId === requestRef.current) setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
    // get n'est pas mémorisé : volontairement absent des dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, disabled, value.join(',')]);

  const add = (raw) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return false;
    const tag = normalizeHashtag(cleaned);
    if (!tag) {
      setError(`« ${cleaned} » n'est pas un hashtag valide (lettres, chiffres, - et _ uniquement, 30 caractères maximum).`);
      return false;
    }
    if (value.includes(tag)) {
      setError(`« #${tag} » est déjà ajouté : les hashtags doivent être distincts.`);
      return false;
    }
    setError(null);
    onChange?.([...value, tag]);
    setText('');
    setSuggestions([]);
    setOpen(false);
    return true;
  };

  const remove = (tag) => {
    setError(null);
    onChange?.(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    const listOpen = open && suggestions.length > 0;
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && listOpen) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      add(listOpen && active >= 0 ? suggestions[active] : text);
    } else if (e.key === 'Tab' && text.trim()) {
      // Valide la saisie en cours sans bloquer la navigation au clavier
      add(listOpen && active >= 0 ? suggestions[active] : text);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  const count = value.length;
  const enough = count >= min;
  const listOpen = open && suggestions.length > 0 && !disabled;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
          {min > 0 && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
        </label>
        {showCounter && min > 0 && (
          <span
            className={cn('text-xs font-medium tabular-nums', enough ? 'text-text-dim' : 'text-text-muted')}
            aria-live="polite"
          >
            {count} / {min} minimum
          </span>
        )}
      </div>

      <div
        className={cn(
          'relative flex flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5',
          'transition-colors duration-200 ease-smooth',
          'focus-within:ring-2',
          error ? 'border-danger focus-within:ring-danger/30' : 'border-border focus-within:border-primary focus-within:ring-primary/30',
          disabled && 'bg-surface-2 cursor-not-allowed'
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 py-0.5 pl-2 pr-1 font-mono text-xs text-primary"
          >
            #{tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              disabled={disabled}
              className="rounded p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed"
              aria-label={`Retirer le hashtag ${tag}`}
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}

        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          value={text}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Laisse le temps au clic sur une suggestion
            setTimeout(() => setOpen(false), 150);
          }}
          autoComplete="off"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-base text-text placeholder:text-text-dim focus:outline-none disabled:cursor-not-allowed"
          style={{ fontSize: '16px' }}
        />

        {listOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions de hashtags"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            {suggestions.map((tag, i) => (
              <li
                key={tag}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(tag);
                }}
                className={cn(
                  'cursor-pointer px-3 py-2 font-mono text-sm',
                  i === active ? 'bg-primary-ghost text-primary' : 'text-text hover:bg-surface-2'
                )}
              >
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p id={hintId} className="text-xs text-text-dim">
        Entrée, virgule ou espace pour valider. Minuscules, sans espace ; le « # » est facultatif.
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
