import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';

export default function TokensPreview() {
  const { theme, setTheme } = useTheme();
  const [season, setSeason] = useState('none');

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('christmas', 'spring');
    };
  }, []);

  const setSeasonClass = (s) => {
    document.documentElement.classList.remove('christmas', 'spring');
    if (s === 'christmas' || s === 'spring') {
      document.documentElement.classList.add(s);
    }
    setSeason(s);
  };

  return (
    <div className="min-h-screen bg-bg text-text p-8 font-sans">
      <div className="max-w-container mx-auto space-y-12">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Tokens & Components Preview</h1>
          <div className="flex gap-2">
            <button onClick={() => setTheme('light')} className="px-3 py-2 rounded-md border border-border text-sm">Light</button>
            <button onClick={() => setTheme('dark')} className="px-3 py-2 rounded-md border border-border text-sm">Dark</button>
            <button onClick={() => setSeasonClass('none')} className="px-3 py-2 rounded-md border border-border text-sm">Off</button>
            <button onClick={() => setSeasonClass('christmas')} className="px-3 py-2 rounded-md border border-border text-sm">Christmas</button>
            <button onClick={() => setSeasonClass('spring')} className="px-3 py-2 rounded-md border border-border text-sm">Spring</button>
          </div>
        </header>

        <section>
          <h2 className="text-xl font-semibold mb-4">Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['primary', 'secondary', 'accent', 'danger', 'bg', 'surface', 'surface-2', 'border', 'border-strong', 'text', 'text-muted', 'text-dim'].map((t) => (
              <div key={t} className="rounded-md border border-border overflow-hidden">
                <div className={`h-16 bg-${t}`} />
                <div className="p-2 text-xs font-mono">{t}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Typography</h2>
          <div className="space-y-2">
            <div className="text-4xl font-bold tracking-tight">Display 4xl / 44px</div>
            <div className="text-3xl font-bold tracking-tight">Title 3xl / 32px</div>
            <div className="text-2xl font-semibold tracking-tight">Section 2xl / 24px</div>
            <div className="text-xl font-semibold">Subtitle xl / 20px</div>
            <div className="text-lg">Lead lg / 17px</div>
            <div className="text-md">Body md / 15px</div>
            <div className="text-base">Base 14px</div>
            <div className="text-sm text-text-muted">Small sm / 13.5px muted</div>
            <div className="text-xs text-text-dim">XS 12px dim</div>
            <div className="font-mono text-sm">JetBrains Mono sample 1234.56</div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Shadows</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-surface rounded-lg shadow-sm flex items-center justify-center text-sm">sm</div>
            <div className="h-20 bg-surface rounded-lg shadow-md flex items-center justify-center text-sm">md</div>
            <div className="h-20 bg-surface rounded-lg shadow-lg flex items-center justify-center text-sm">lg</div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">IconButton</h2>
          <div className="flex flex-wrap gap-4">
            {['default', 'ghost', 'danger'].map((variant) => (
              <div key={variant} className="flex flex-col items-center gap-2">
                <span className="text-xs font-mono text-text-dim">{variant}</span>
                <div className="flex items-center gap-2">
                  {['sm', 'md', 'lg'].map((size) => (
                    <IconButton key={size} variant={variant} size={size} aria-label={`${variant} ${size}`}>
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 5v3l2 2" />
                      </svg>
                    </IconButton>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Button</h2>
          <div className="space-y-4">
            {['primary', 'ghost', 'outline', 'danger', 'subtle'].map((variant) => (
              <div key={variant} className="flex flex-wrap items-center gap-3">
                <span className="w-20 text-xs font-mono text-text-dim">{variant}</span>
                <Button variant={variant} size="sm">Small</Button>
                <Button variant={variant} size="md">Medium</Button>
                <Button variant={variant} size="lg">Large</Button>
                <Button variant={variant} size="md" loading>Loading</Button>
                <Button variant={variant} size="md" disabled>Disabled</Button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Form inputs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium">Input normal</label>
              <Input placeholder="Placeholder..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Input error</label>
              <Input error placeholder="Invalid value" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Input disabled</label>
              <Input disabled placeholder="Disabled" value="Valeur existante" readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Textarea (auto-grow)</label>
              <Textarea autoGrow placeholder="Écris ici..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select</label>
              <Select>
                <option value="">Choisir...</option>
                <option value="a">Option A</option>
                <option value="b">Option B</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select error</label>
              <Select error>
                <option value="">Choisir...</option>
                <option value="a">Option A</option>
              </Select>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
