import { useTheme } from 'next-themes';
import { useState } from 'react';

export default function TokensPreview() {
  const { theme, setTheme } = useTheme();
  const [season, setSeason] = useState('none');

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

        {/* Les sections suivantes seront ajoutées au fil des phases */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Components</h2>
          <p className="text-text-muted">Ajoutés au fil des phases 2 et 3.</p>
        </section>
      </div>
    </div>
  );
}
