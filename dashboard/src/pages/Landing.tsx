import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Menu, MessageSquare, Calculator, Send, X } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import type { PlatformStats, PublicPlan } from '@/types';

// ─── Révélation au scroll (légère, désactivée si reduced-motion) ──────────────

function Reveal({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} className={cn('reveal', visible && 'is-visible', className)}>
      {children}
    </Tag>
  );
}

// ─── Logo : wordmark seul ──────────────────────────────────────────────────────

function DevisAILogo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[15px] font-medium',
        inverted ? 'text-white' : 'text-stone-900',
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5 text-orange-600" fill="none" aria-hidden="true">
        <path d="M6 7h11M6 12h13M6 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Devis AI
    </span>
  );
}

// Signature : un chiffre en mono suivi de son unité, partout où il y a un prix.
function Figure({ value, unit, className }: { value: string; unit?: string; className?: string }) {
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {value}
      {unit !== undefined && <span className="ml-1 text-stone-400">{unit}</span>}
    </span>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'Le widget recueille la demande',
    desc: 'Type de travaux, surface, adresse',
    icon: MessageSquare,
  },
  {
    title: 'Le devis est chiffré avec vos prix',
    desc: 'Depuis votre grille, sans montant inventé',
    icon: Calculator,
  },
  {
    title: 'Vous relisez et envoyez',
    desc: 'En un clic',
    icon: Send,
  },
] as const;

const HIGHLIGHT_POINTS = [
  'Vos prix, vos zones, vos règles',
  'Historique des versions',
  "Équipe et journal d'audit",
] as const;

const METIERS = [
  {
    title: 'Rénovation énergétique',
    scope: 'Isolation · PAC · panneaux solaires',
    unit: 'm²',
    image:
      'https://images.pexels.com/photos/8853536/pexels-photo-8853536.jpeg?auto=compress&cs=tinysrgb&w=1000',
    alt: 'Deux techniciens installant des panneaux solaires sur un toit',
  },
  {
    title: 'Plomberie, chauffage, sanitaire',
    scope: 'Dépannage · installation · entretien',
    unit: 'prestation',
    image:
      'https://images.pexels.com/photos/6419128/pexels-photo-6419128.jpeg?auto=compress&cs=tinysrgb&w=1000',
    alt: 'Plombier installant des raccords de tuyauterie',
  },
  {
    title: 'Électricité',
    scope: 'Mise aux normes · tableaux · prises',
    unit: 'point',
    image:
      'https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=1000',
    alt: 'Électricien intervenant sur un tableau électrique ouvert',
  },
  {
    title: 'Menuiserie, fenêtres, portes',
    scope: 'Fenêtres · portes · agencement',
    unit: 'unité',
    image:
      'https://images.pexels.com/photos/28513061/pexels-photo-28513061.jpeg?auto=compress&cs=tinysrgb&w=1000',
    alt: 'Menuisier travaillant le bois dans son atelier',
  },
  {
    title: 'Peinture, revêtements sols et murs',
    scope: 'Peinture · sols · murs',
    unit: 'm²',
    image:
      'https://images.pexels.com/photos/6474471/pexels-photo-6474471.jpeg?auto=compress&cs=tinysrgb&w=1000',
    alt: 'Peintre appliquant de la peinture au rouleau sur un mur',
  },
  {
    title: 'Serrurerie, dépannage',
    scope: 'Ouverture · pose · dépannage 24/7',
    unit: 'forfait',
    image:
      'https://images.pexels.com/photos/3276079/pexels-photo-3276079.jpeg?auto=compress&cs=tinysrgb&w=1000',
    alt: 'Gros plan sur une poignée et une serrure de porte',
  },
] as const;

const NAV_LINKS = [
  { label: 'Fonctionnement', href: '#fonctionnement' },
  { label: 'Métiers', href: '#metiers' },
  { label: 'Démo', href: '#demo' },
  { label: 'Tarifs', href: '#tarifs' },
] as const;

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-orange-700 font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-orange-800 active:scale-[0.98]';
const btnDark =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-stone-800 active:scale-[0.98]';

// ─── Sections ─────────────────────────────────────────────────────────────────

function Header() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      const goingDown = y > lastScrollY.current;
      setHidden(goingDown && y > 80);
      lastScrollY.current = y;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isHidden = hidden && !menuOpen;

  return (
    <div className="sticky top-0 z-40">
      <header
        className={cn(
          'border-b bg-stone-50/95 backdrop-blur transition-[border-color,transform] duration-300 ease-out',
          scrolled ? 'border-stone-900/10' : 'border-transparent',
          isHidden && '-translate-y-full',
        )}
      >
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto] items-center px-6 md:grid-cols-[1fr_auto_1fr]">
          <Link to="/" className="shrink-0">
            <DevisAILogo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm text-stone-600 transition-colors hover:text-stone-900"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center justify-end gap-6 md:flex">
            {isAuthenticated ? (
              <Link to="/app" className={cn(btnDark, 'h-9 px-4 text-sm')}>
                Mon espace <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm text-stone-600 transition-colors hover:text-stone-900">
                  Se connecter
                </Link>
                <Link to="/register" className={cn(btnDark, 'h-9 px-4 text-sm')}>
                  Démarrer gratuitement
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="flex size-9 items-center justify-center justify-self-end rounded-lg text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-900 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" strokeWidth={1.5} /> : <Menu className="size-5" strokeWidth={1.5} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-stone-900/10 bg-stone-50 md:hidden">
            <nav className="flex flex-col px-6 py-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-sm text-stone-600 transition-colors hover:text-stone-900"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t border-stone-900/10 pt-4">
                {isAuthenticated ? (
                  <Link to="/app" className={cn(btnDark, 'h-10 text-sm')}>
                    Mon espace <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="flex h-10 items-center justify-center rounded-lg border border-stone-900/10 text-sm text-stone-700 transition-colors hover:bg-white"
                    >
                      Se connecter
                    </Link>
                    <Link to="/register" className={cn(btnDark, 'h-10 text-sm')}>
                      Démarrer gratuitement
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>
    </div>
  );
}

// Le moment de la page : la demande du visiteur et le devis qu'elle produit.
const QUOTE_LINES = [
  { label: 'Préparation des murs, rebouchage', qty: '42', unit: 'm²', price: '6,00', total: '252,00' },
  { label: 'Peinture intérieure, 2 couches', qty: '42', unit: 'm²', price: '28,00', total: '1 176,00' },
  { label: 'Protection des sols et mobilier', qty: '1', unit: 'forfait', price: '90,00', total: '90,00' },
] as const;

function QuotePreview() {
  return (
    <div aria-hidden="true" className="relative select-none">
      <div className="absolute -top-6 left-4 right-4 z-10 sm:right-auto sm:-left-10 sm:max-w-64 rounded-xl border border-stone-900/10 bg-white p-3 text-[13px] leading-snug text-stone-700 shadow-[0_8px_24px_rgb(28_25_23/0.12)]">
        <p className="text-[11px] text-stone-400">Visiteur · via le widget</p>
        <p className="mt-1">
          Je voudrais repeindre un salon de <Figure value="42" unit="m²" className="text-stone-900" />,
          murs seulement, à Villeurbanne
        </p>
      </div>

      <div className="rounded-2xl border border-stone-900/10 bg-[#fffdf9] p-5 pt-16 shadow-[0_24px_48px_-12px_rgb(28_25_23/0.35)] sm:p-8 sm:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <p className="text-sm font-medium text-stone-900">Atelier Dupont</p>
            <p className="text-xs text-stone-500">Peinture et revêtements · Lyon</p>
          </div>
          <div className="sm:text-right">
            <p className="whitespace-nowrap font-mono text-xs text-stone-500">Devis D-2026-0148</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-stone-500">
              <span className="size-1.5 rounded-full bg-amber-500" />
              Brouillon à valider
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-stone-900/10">
          {QUOTE_LINES.map((l) => (
            <div
              key={l.label}
              className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-dashed border-stone-900/10 py-3 text-sm"
            >
              <span className="text-stone-800">{l.label}</span>
              <Figure value={`${l.total} €`} className="whitespace-nowrap text-right text-stone-900" />
              <span className="font-mono text-xs tabular-nums text-stone-400">
                {l.qty} {l.unit} × {l.price} €
              </span>
            </div>
          ))}
        </div>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between text-stone-500">
            <dt>Total HT</dt>
            <dd className="font-mono tabular-nums">1 518,00 €</dd>
          </div>
          <div className="flex justify-between text-stone-500">
            <dt>TVA 10 %</dt>
            <dd className="font-mono tabular-nums">151,80 €</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-stone-900/10 pt-3">
            <dt className="font-medium text-stone-900">Total TTC</dt>
            <dd className="whitespace-nowrap font-mono text-xl tabular-nums text-orange-700 sm:text-2xl">1 669,80 €</dd>
          </div>
        </dl>

      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative flex-1 overflow-hidden bg-stone-50">
      <img
        src="https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=1600&h=720&q=85"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-stone-50/90 via-stone-50/65 to-stone-50/15"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-16 lg:grid-cols-[1fr_1.05fr] lg:py-24">
        <div className="animate-enter min-w-0">
          <p className="text-sm text-stone-500">Pour les artisans du bâtiment</p>
          <h1 className="mt-4 text-balance text-4xl font-medium leading-[1.1] tracking-tight text-stone-900 lg:text-5xl">
            Vos visiteurs décrivent leurs travaux, vous recevez le devis chiffré
          </h1>
          <p className="mt-6 max-w-xl text-lg text-stone-600">
            Le chatbot recueille la demande, votre grille fait le calcul
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/register" className={cn(btnPrimary, 'h-12 px-6 text-base')}>
              Démarrer gratuitement <ArrowRight className="size-4" strokeWidth={1.5} />
            </Link>
            <a
              href="#demo"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-stone-900/15 px-6 text-base text-stone-800 transition-colors hover:bg-white"
            >
              Voir la démo
            </a>
          </div>
        </div>

        <div className="animate-enter min-w-0 pt-6 sm:px-8 lg:px-0 lg:pt-0" style={{ animationDelay: '80ms' }}>
          <QuotePreview />
        </div>
      </div>
    </section>
  );
}

// Compteurs réels de la plateforme (base de données via l'API). La bande est
// masquée tant que les chiffres ne sont pas chargés ou que tout est à zéro :
// on n'affiche jamais de métrique inventée.
function MetricsBar() {
  const { data } = useApi<PlatformStats>('/api/v1/stats/platform');
  if (!data) return null;

  const fmt = new Intl.NumberFormat('fr-FR');
  const metrics = [
    { value: data.quotesGenerated, label: 'devis générés' },
    { value: data.companiesRegistered, label: 'entreprises inscrites' },
    { value: data.leadsCaptured, label: 'prospects captés' },
  ];
  if (metrics.every((m) => m.value === 0)) return null;

  return (
    <section className="border-y border-stone-900/10 bg-white">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col divide-y divide-stone-900/10 sm:flex-row sm:divide-x sm:divide-y-0">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-1 items-baseline justify-center gap-3 py-8">
              <span className="font-mono text-3xl tabular-nums text-stone-900">{fmt.format(m.value)}</span>
              <span className="text-sm text-stone-500">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <Reveal className="max-w-2xl">
      <h2 className="text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl">{title}</h2>
      {lead !== undefined && <p className="mt-4 text-lg text-stone-600">{lead}</p>}
    </Reveal>
  );
}

function Steps() {
  return (
    <section id="fonctionnement" className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead title="Comment ça marche" />

        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-stone-900/10 bg-stone-900/10 sm:grid-cols-3">
          {STEPS.map(({ title, desc, icon: Icon }, i) => (
            <li key={title} className="bg-white p-6 sm:p-8">
              <div className="flex items-center gap-3 text-stone-400">
                <span className="font-mono text-sm tabular-nums">0{i + 1}</span>
                <Icon className="size-[18px]" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 font-medium text-stone-900">{title}</h3>
              <p className="mt-2 text-sm text-stone-600">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Metiers() {
  return (
    <section id="metiers" className="border-t border-stone-900/10 bg-stone-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead title="Votre métier, votre unité de prix" />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {METIERS.map((m) => (
            <Reveal
              as="article"
              key={m.title}
              className="flex flex-col overflow-hidden rounded-2xl border border-stone-900/10 bg-white"
            >
              <img src={m.image} alt={m.alt} className="h-44 w-full object-cover" loading="lazy" />
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-medium text-stone-900">{m.title}</h3>
                  <span className="shrink-0 font-mono text-xs text-stone-400">€ / {m.unit}</span>
                </div>
                <p className="mt-1 text-xs text-stone-500">{m.scope}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-12 text-sm text-stone-500">
          Un autre métier ?{' '}
          <Link to="/register" className="text-stone-900 underline decoration-stone-900/20 underline-offset-4 hover:decoration-stone-900">
            Créer mes prestations
          </Link>
        </p>
      </div>
    </section>
  );
}

function Highlight() {
  const rows = [
    { label: 'Peinture intérieure', unit: 'm²', price: '28 €' },
    { label: 'Isolation des combles', unit: 'm²', price: '38 €' },
    { label: 'Pose fenêtre PVC', unit: 'unité', price: '420 €' },
    { label: 'Dépannage serrurerie', unit: 'forfait', price: '89 €' },
  ];

  return (
    <section className="border-t border-stone-900/10 bg-white py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 lg:grid-cols-2">
        <Reveal className="order-2 overflow-hidden rounded-2xl border border-stone-900/10 bg-stone-50 lg:order-1">
          <div className="flex items-center justify-between border-b border-stone-900/10 px-6 py-4">
            <span className="text-sm font-medium text-stone-900">Grille tarifaire</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Mise à jour il y a 2 min
            </span>
          </div>
          <div className="flex items-center justify-between px-6 pt-4 text-xs text-stone-400">
            <span>Prestation</span>
            <span>Prix unitaire HT</span>
          </div>
          <div className="divide-y divide-stone-900/10 px-6 pb-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-4 text-sm">
                <span className="text-stone-700">{row.label}</span>
                <Figure value={row.price} unit={`/ ${row.unit}`} className="text-stone-900" />
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="order-1 lg:order-2">
          <h2 className="text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl">
            Votre tarification, vos règles
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHT_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-stone-700">
                <Check className="mt-1 size-4 shrink-0 text-stone-400" strokeWidth={1.5} />
                {p}
              </li>
            ))}
          </ul>
          <Link to="/register" className={cn(btnDark, 'mt-8 h-11 px-5 text-sm')}>
            Créer ma grille tarifaire <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

// ─── Aperçu du dashboard (aria-hidden, purement visuel) ──────────────────────

const MOCK_QUOTES = [
  { client: 'M. Benali', job: 'Peinture salon 42 m²', status: 'Accepté', dot: 'bg-emerald-500', total: '1 669,80 €' },
  { client: 'Mme Royer', job: 'Isolation combles 65 m²', status: 'Envoyé', dot: 'bg-stone-400', total: '2 717,00 €' },
  { client: 'SCI Les Tilleuls', job: 'Pose 4 fenêtres PVC', status: 'Brouillon', dot: 'bg-amber-500', total: '1 848,00 €' },
  { client: 'M. Faure', job: 'Ouverture de porte', status: 'Envoyé', dot: 'bg-stone-400', total: '97,90 €' },
] as const;

function DashboardMockup() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none overflow-hidden rounded-xl border border-white/10 bg-stone-950 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.5)]"
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-3 font-mono text-[11px] text-stone-500">app.devis-ai.fr</span>
      </div>

      <div className="space-y-4 bg-stone-50 p-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Devis ce mois', value: '38' },
            { label: 'Taux d’acceptation', value: '42 %' },
            { label: 'Montant accepté', value: '24 310 €' },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-stone-900/10 bg-white p-3">
              <p className="text-[11px] text-stone-500">{k.label}</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-stone-900">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-stone-900/10 bg-white">
          <p className="border-b border-stone-900/10 px-3 py-2 text-xs font-medium text-stone-900">Devis récents</p>
          {MOCK_QUOTES.map((q) => (
            <div
              key={q.client}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-stone-900/5 px-3 py-2 text-[11px] last:border-0"
            >
              <span className="truncate">
                <span className="text-stone-900">{q.client}</span>
                <span className="ml-2 text-stone-500">{q.job}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-stone-500">
                <span className={cn('size-1.5 rounded-full', q.dot)} />
                {q.status}
              </span>
              <span className="font-mono tabular-nums text-stone-900">{q.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DEMO_FEATURES = [
  'Devis, prospects et statistiques',
  'Sans inscription ni carte bancaire',
] as const;

function DemoSection() {
  return (
    <section id="demo" className="bg-stone-900 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
            Testez le dashboard sans créer de compte
          </h2>

          <ul className="mt-8 space-y-3">
            {DEMO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-stone-300">
                <Check className="mt-0.5 size-4 shrink-0 text-stone-500" strokeWidth={1.5} />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link
              to="/demo"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-stone-50 px-5 text-sm font-medium text-stone-900 transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.98]"
            >
              Accéder à la démo <ArrowRight className="size-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        <div className="hidden lg:block">
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}

// Offres réelles servies par l'API (mêmes gates que la page Abonnement de
// l'app). Le paiement en ligne n'existe pas encore : aucun prix fictif n'est
// affiché — le plan Premium est offert pendant la bêta.
function Pricing() {
  const { data: plans } = useApi<PublicPlan[]>('/api/v1/billing/plans');
  if (!plans || plans.length === 0) return null;

  return (
    <section id="tarifs" className="bg-stone-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead title="Tarifs" lead="Sans engagement" />

        <div className="mt-12 grid items-start gap-6 md:grid-cols-2">
          {plans.map((plan) => {
            const isFeatured = plan.featured;
            return (
              <Reveal
                key={plan.id}
                className={cn(
                  'rounded-2xl border bg-white p-8',
                  isFeatured ? 'border-stone-900' : 'border-stone-900/10',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-medium text-stone-900">{plan.name}</h3>
                  {isFeatured && <span className="text-xs text-stone-500">Le plus choisi</span>}
                </div>
                <p className="mt-1 text-sm text-stone-500">{plan.tagline}</p>

                <p className="mt-6 flex items-baseline gap-2">
                  <span className="font-mono text-4xl tabular-nums text-stone-900">0 €</span>
                  <span className="text-sm text-stone-500">{isFeatured ? 'pendant la bêta' : 'par mois'}</span>
                </p>

                <Link
                  to="/register"
                  className={cn(
                    'mt-6 h-10 w-full text-sm',
                    isFeatured
                      ? btnPrimary
                      : 'inline-flex items-center justify-center gap-2 rounded-lg border border-stone-900/15 font-medium text-stone-900 transition-colors hover:bg-stone-50',
                  )}
                >
                  {isFeatured ? 'Choisir Premium' : 'Démarrer'}
                </Link>

                <ul className="mt-6 space-y-3 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-stone-600">
                      <Check className="mt-0.5 size-4 shrink-0 text-stone-400" strokeWidth={1.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden bg-stone-900 py-24">
      <img
        src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1600&h=600&q=80"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale"
        loading="lazy"
      />
      <div className="relative mx-auto max-w-6xl px-6">
        <h2 className="max-w-xl text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Répondez à vos prospects en quelques minutes, pas en plusieurs jours
        </h2>
        <Link to="/register" className={cn(btnPrimary, 'mt-8 h-12 px-6 text-base')}>
          Démarrer gratuitement <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  const linkCls = 'text-stone-500 transition-colors hover:text-stone-900';
  return (
    <footer className="border-t border-stone-900/10 bg-stone-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-3 sm:gap-12">
          <div>
            <DevisAILogo />
            <p className="mt-3 text-sm text-stone-500">Le devis automatisé pour les artisans</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-stone-900">Produit</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="#fonctionnement" className={linkCls}>Fonctionnement</a></li>
              <li><a href="#tarifs" className={linkCls}>Tarifs</a></li>
              <li><Link to="/login" className={linkCls}>Se connecter</Link></li>
              <li><Link to="/register" className={linkCls}>Créer un compte</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-stone-900">Légal</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {['Mentions légales', 'CGU', 'Confidentialité'].map((l) => (
                <li key={l}>
                  <a href="#" className={linkCls}>{l}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-12 border-t border-stone-900/10 pt-6 text-sm text-stone-400">© 2026 Devis AI</p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    // overflow-x-clip (et non -hidden) : empêche le débordement horizontal sans
    // créer de conteneur de défilement, ce qui préserve le `sticky` du header.
    <div className="overflow-x-clip bg-stone-50">
      <div className="flex min-h-dvh flex-col">
        <Header />
        <Hero />
        <MetricsBar />
      </div>
      <Steps />
      <Metiers />
      <Highlight />
      <DemoSection />
      <Pricing />
      <CtaBand />
      <Footer />
    </div>
  );
}
