// pages/idees/index.js — catalogue des idées de la Piscine idéation
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppHeader from '../../components/layout/AppHeader';
import Footer from '../../components/layout/Footer';
import PageHead from '../../components/ui/PageHead';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import FilterChips from '../../components/ui/FilterChips';
import BentoGrid from '../../components/ui/BentoGrid';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import Pagination from '../../components/ui/Pagination';
import IdeaCard from '../../components/ideas/IdeaCard';
import HashtagInput from '../../components/ideas/HashtagInput';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { cn } from '../../lib/cn';
import { CATALOGUE_PAGE_SIZE, errorText, normalizeHashtag } from '../../lib/ideation';

const SORT_OPTIONS = [
  { value: 'date', label: 'Plus récentes' },
  { value: 'title', label: 'Titre (A → Z)' },
];

const SearchIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.5 13.5L17 17" strokeLinecap="round" />
  </svg>
);

function GridSkeleton() {
  return (
    <BentoGrid>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
          <Skeleton variant="rect" className="aspect-video w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton variant="text" width="70%" height={20} />
            <Skeleton variant="text" width="100%" />
            <Skeleton variant="text" width="85%" />
          </div>
        </div>
      ))}
    </BentoGrid>
  );
}

export default function IdeasCatalogue() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const { get } = useApi();

  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [tags, setTags] = useState([]);
  const [sort, setSort] = useState('date');
  const [page, setPage] = useState(1);
  const [ideas, setIdeas] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [isAuthenticated, authLoading, router]);

  // Filtre initial depuis l'URL (?tags=ia,sante), par exemple depuis un hashtag de fiche
  useEffect(() => {
    if (!router.isReady || ready) return;
    const raw = typeof router.query.tags === 'string' ? router.query.tags : '';
    const initial = [...new Set(raw.split(',').map(normalizeHashtag).filter(Boolean))];
    setTags(initial);
    setReady(true);
  }, [router.isReady, router.query.tags, ready]);

  // Anti-rebond de la recherche texte
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const tagsKey = tags.join(',');

  useEffect(() => {
    if (!isAuthenticated || !ready) return;
    fetchIdeas();
    // get n'est pas mémorisé : fetchIdeas l'utilise sans être une dépendance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready, q, tagsKey, sort, page]);

  const fetchIdeas = async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = { sort, page, limit: CATALOGUE_PAGE_SIZE };
      if (q) params.q = q;
      if (tagsKey) params.tags = tagsKey;
      const res = await get('/api/ideas', params);
      if (requestId !== requestRef.current) return;
      setIdeas(Array.isArray(res.data) ? res.data : []);
      setTotal(typeof res.total === 'number' ? res.total : 0);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setIdeas([]);
      setTotal(0);
      setError(errorText(err, 'Impossible de charger le catalogue'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const changeTags = (next) => {
    setTags(next);
    setPage(1);
  };

  const toggleTag = (tag) => {
    changeTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };

  const reset = () => {
    setSearchInput('');
    setQ('');
    setTags([]);
    setSort('date');
    setPage(1);
  };

  const filtersActive = Boolean(searchInput.trim()) || tags.length > 0 || sort !== 'date';
  const totalPages = Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));

  // Hashtags présents dans la page affichée, proposés en filtres rapides
  const pageTags = [...new Set(ideas.flatMap((i) => i.hashtags || []))]
    .filter((t) => !tags.includes(t))
    .slice(0, 12);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <AppHeader />
        <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
          <Skeleton variant="text" width="40%" height={32} className="mb-8" />
          <GridSkeleton />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Head>
        <title>Hub Projets - Catalogue des idées</title>
      </Head>

      <AppHeader />

      <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: 'Idéation' }]} />

        <PageHead
          title="Catalogue des idées"
          sub="Les idées de la Piscine idéation. Cherchez par titre ou par nom d'étudiant, filtrez par hashtags."
          actions={
            <Button as="a" href="/idees/nouvelle" onClick={(e) => { e.preventDefault(); router.push('/idees/nouvelle'); }}>
              Soumettre une idée
            </Button>
          }
        />

        <section aria-label="Recherche et filtres" className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="idea-search" className="text-sm font-medium text-text">Rechercher</label>
              <Input
                id="idea-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Titre d'idée ou nom d'étudiant"
                leadingIcon={<SearchIcon />}
                autoComplete="off"
              />
            </div>
            <HashtagInput
              label="Filtrer par hashtag"
              value={tags}
              onChange={changeTags}
              min={0}
              showCounter={false}
              placeholder="Ex. ia"
            />
          </div>

          {pageTags.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-dim">Hashtags de cette page</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Ajouter un filtre hashtag">
                {pageTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-label={`Filtrer par #${tag}`}
                    className={cn(
                      'rounded-full px-3 py-1 font-mono text-xs font-medium',
                      'bg-surface-2 text-text-muted hover:bg-border hover:text-text',
                      'transition-colors duration-150 ease-smooth',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
                    )}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-text-muted">Trier :</span>
              <FilterChips
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => { setSort(v); setPage(1); }}
              />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-muted" aria-live="polite">
                {loading ? 'Chargement…' : `${total} idée${total > 1 ? 's' : ''}`}
              </p>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={reset}>Réinitialiser</Button>
              )}
            </div>
          </div>
        </section>

        {error ? (
          <EmptyState
            title="Le catalogue n'a pas pu être chargé"
            sub={error}
            action={<Button variant="outline" onClick={fetchIdeas}>Réessayer</Button>}
          />
        ) : loading ? (
          <GridSkeleton />
        ) : ideas.length === 0 ? (
          filtersActive ? (
            <EmptyState
              title="Aucune idée ne correspond"
              sub="Essayez un autre mot-clé ou retirez un hashtag."
              action={<Button variant="outline" onClick={reset}>Réinitialiser les filtres</Button>}
            />
          ) : (
            <EmptyState
              title="Aucune idée pour l'instant"
              sub="Les idées apparaissent ici dès que leur deck est déposé."
              action={
                <Button as="a" href="/idees/nouvelle" onClick={(e) => { e.preventDefault(); router.push('/idees/nouvelle'); }}>
                  Soumettre la première idée
                </Button>
              }
            />
          )
        ) : (
          <>
            <BentoGrid>
              {ideas.map((idea) => <IdeaCard key={idea._id} idea={idea} />)}
            </BentoGrid>
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={(p) => {
                    setPage(p);
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
