import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import HashtagInput from './HashtagInput';
import { cn } from '../../lib/cn';
import {
  DESCRIPTION_MAX_WORDS,
  MIN_HASHTAGS,
  TITLE_MAX,
  charLength,
  countWords,
} from '../../lib/ideation';

// Contrôles du miroir client ; le serveur revalide tout
export const checkIdeaFields = ({ title, description, hashtags }) => {
  const errors = {};
  const titleLength = charLength(title.trim());
  if (!titleLength) errors.title = 'Le titre est requis';
  else if (titleLength > TITLE_MAX) errors.title = `Le titre ne doit pas dépasser ${TITLE_MAX} caractères`;

  const words = countWords(description);
  if (!words) errors.description = 'La description est requise';
  else if (words > DESCRIPTION_MAX_WORDS) errors.description = `La description ne doit pas dépasser ${DESCRIPTION_MAX_WORDS} mots`;

  if (new Set(hashtags).size < MIN_HASHTAGS) errors.hashtags = `Au moins ${MIN_HASHTAGS} hashtags distincts sont requis`;
  return errors;
};

/**
 * IdeaFields — titre, description (compteur de mots en direct) et hashtags.
 * Props: value ({ title, description, hashtags }), onChange(next), disabled, showErrors.
 */
export default function IdeaFields({ value, onChange, disabled = false, showErrors = false }) {
  const errors = checkIdeaFields(value);
  const titleLength = charLength(value.title.trim());
  const words = countWords(value.description);
  const tooManyWords = words > DESCRIPTION_MAX_WORDS;
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <FormField
        label="Titre"
        required
        hint={`${titleLength} / ${TITLE_MAX} caractères`}
        error={(showErrors || titleLength > TITLE_MAX) ? errors.title : undefined}
      >
        <Input
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Le nom de votre idée"
          disabled={disabled}
          error={titleLength > TITLE_MAX}
          autoComplete="off"
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <FormField
          label="Description"
          required
          error={(showErrors || tooManyWords) ? errors.description : undefined}
        >
          <Textarea
            rows={4}
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Le problème, pour qui, et votre solution, en 50 mots maximum."
            disabled={disabled}
            error={tooManyWords}
          />
        </FormField>
        <p
          className={cn('text-xs tabular-nums', tooManyWords ? 'font-semibold text-danger' : 'text-text-dim')}
          aria-live="polite"
        >
          {words} / {DESCRIPTION_MAX_WORDS} mots
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <HashtagInput
          value={value.hashtags}
          onChange={(hashtags) => set({ hashtags })}
          disabled={disabled}
        />
        {showErrors && errors.hashtags && (
          <p role="alert" className="text-xs text-danger">{errors.hashtags}</p>
        )}
      </div>
    </div>
  );
}
