import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Bell,
  Building2,
  Check,
  ClipboardList,
  MapPin,
  Plus,
  Trash2,
  UserRound,
  Wand2,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, type Tab } from '@/components/Tabs';
import { TradePicker } from '@/components/TradePicker';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { mergeCatalog, presetCatalog } from '@/lib/catalog';
import { getTrade, type CatalogItem, type TradeId } from '@/lib/trades';
import { UNIT_OPTIONS, unitLabel } from '@/lib/units';
import { formatPercent } from '@/lib/format';
import {
  companySchema,
  profileSchema,
  type CompanyFormInput,
  type CompanyValues,
  type ProfileValues,
} from '@/lib/validation/settings';

const TABS: Tab[] = [
  { id: 'profil', label: 'Profil', icon: UserRound },
  { id: 'entreprise', label: 'Entreprise', icon: Building2 },
  { id: 'catalogue', label: 'Catalogue', icon: ClipboardList },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function Settings() {
  // Onglet piloté par ?tab=
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some((t) => t.id === requested) ? (requested as string) : 'profil';
  const setTab = (id: string) => setParams(id === 'profil' ? {} : { tab: id }, { replace: true });
  const { activeMembership } = useAuth();
  // Remonte les sections liées à l'entreprise quand on change d'espace actif.
  const companyKey = activeMembership?.company.id ?? 'none';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Réglages" subtitle="Gérez votre compte, votre entreprise et votre équipe." />
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

      {tab === 'profil' && <ProfileSection />}
      {tab === 'entreprise' && <CompanySection key={companyKey} />}
      {tab === 'catalogue' && (
        <div className="flex flex-col gap-6">
          <CatalogSection key={companyKey} />
          <ZoneSection key={`z-${companyKey}`} />
        </div>
      )}
      {tab === 'notifications' && <NotificationsSection />}
    </div>
  );
}

// État de sauvegarde partagé par les formulaires (appel API réel + confirmation).
function useSave(action: () => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaved(false);
    setError('');
    setSaving(true);
    try {
      await action();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return { saving, saved, error, save };
}

function SaveRow({ saved, saving, error }: { saved: boolean; saving: boolean; error: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" loading={saving}>
        Enregistrer
      </Button>
      {saved && (
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="size-4" />
          Modifications enregistrées
        </span>
      )}
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </div>
  );
}

function ProfileSection() {
  const { user, refreshSession } = useAuth();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  });

  const { saving, saved, error, save } = useSave(async () => {
    // Le nom complet saisi est découpé en prénom + nom pour l'API.
    const [first, ...rest] = getValues('name').trim().split(/\s+/);
    await api.patch('/api/v1/auth/me', { first_name: first ?? '', last_name: rest.join(' ') });
    await refreshSession();
  });

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader title="Profil" subtitle="Vos informations personnelles." />
      <form onSubmit={handleSubmit(save)} className="flex flex-col gap-4" noValidate>
        <Field label="Nom complet" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          required
          error={errors.email?.message}
          hint="L'email de connexion ne peut pas être modifié pour le moment."
        >
          <Input id="email" type="email" disabled invalid={!!errors.email} {...register('email')} />
        </Field>
        <SaveRow saved={saved} saving={saving} error={error} />
      </form>
    </Card>
  );
}

function CompanySection() {
  const { activeMembership, refreshSession } = useAuth();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CompanyFormInput, unknown, CompanyValues>({
    resolver: zodResolver(companySchema),
    // `values` (et non `defaultValues`) pour que le formulaire suive l'entreprise active.
    values: {
      name: activeMembership?.company.name ?? '',
      siret: activeMembership?.company.siret ?? '',
      address: activeMembership?.company.address ?? '',
      defaultVatRate: activeMembership?.company.defaultVatRate ?? 0.2,
      legalForm: activeMembership?.company.legalForm ?? '',
      shareCapital: activeMembership?.company.shareCapital ?? '',
      rcsRm: activeMembership?.company.rcsRm ?? '',
      apeCode: activeMembership?.company.apeCode ?? '',
      vatNumber: activeMembership?.company.vatNumber ?? '',
      vatExempt: activeMembership?.company.vatExempt ?? false,
      insuranceName: activeMembership?.company.insuranceName ?? '',
      insuranceContract: activeMembership?.company.insuranceContract ?? '',
      insuranceCoverage: activeMembership?.company.insuranceCoverage ?? '',
      mediatorName: activeMembership?.company.mediatorName ?? '',
      mediatorUrl: activeMembership?.company.mediatorUrl ?? '',
    },
  });

  const { saving, saved, error, save } = useSave(async () => {
    const v = getValues();
    await api.patch('/api/v1/companies/current', {
      name: v.name,
      siret: v.siret ?? '',
      address: v.address ?? '',
      defaultVatRate: Number(v.defaultVatRate),
      legalForm: v.legalForm ?? '',
      shareCapital: v.shareCapital ?? '',
      rcsRm: v.rcsRm ?? '',
      apeCode: v.apeCode ?? '',
      vatNumber: v.vatNumber ?? '',
      vatExempt: Boolean(v.vatExempt),
      insuranceName: v.insuranceName ?? '',
      insuranceContract: v.insuranceContract ?? '',
      insuranceCoverage: v.insuranceCoverage ?? '',
      mediatorName: v.mediatorName ?? '',
      mediatorUrl: v.mediatorUrl ?? '',
    });
    await refreshSession();
  });

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader title="Entreprise" subtitle="Informations affichées sur vos devis." />
      <form onSubmit={handleSubmit(save)} className="flex flex-col gap-4" noValidate>
        <Field label="Raison sociale" htmlFor="cname" required error={errors.name?.message}>
          <Input id="cname" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="SIRET" htmlFor="siret" error={errors.siret?.message}>
          <Input id="siret" invalid={!!errors.siret} {...register('siret')} />
        </Field>
        <Field label="Adresse" htmlFor="address" error={errors.address?.message}>
          <Input id="address" {...register('address')} />
        </Field>
        <Field
          label="TVA par défaut"
          htmlFor="vat"
          error={errors.defaultVatRate?.message}
          hint="Ratio appliqué aux nouveaux devis (ex. 0.2 pour 20 %)."
        >
          <Input
            id="vat"
            type="number"
            step="0.01"
            invalid={!!errors.defaultVatRate}
            {...register('defaultVatRate')}
          />
        </Field>

        {/* ── Mentions légales (obligatoires sur les devis en France) ──────── */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Mentions légales</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Informations obligatoires sur un devis. Elles apparaissent automatiquement sur vos
            PDF (personnalisables dans « Personnaliser le devis »).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forme juridique" htmlFor="legalForm" hint="Ex. SARL, SASU, auto-entrepreneur">
            <Input id="legalForm" placeholder="SASU" {...register('legalForm')} />
          </Field>
          <Field label="Capital social" htmlFor="shareCapital">
            <Input id="shareCapital" placeholder="5 000 €" {...register('shareCapital')} />
          </Field>
          <Field label="RCS / RM" htmlFor="rcsRm" hint="Immatriculation + ville">
            <Input id="rcsRm" placeholder="RCS Paris 900 123 456" {...register('rcsRm')} />
          </Field>
          <Field label="Code APE / NAF" htmlFor="apeCode">
            <Input id="apeCode" placeholder="4334Z" {...register('apeCode')} />
          </Field>
          <Field label="N° TVA intracommunautaire" htmlFor="vatNumber" className="sm:col-span-2">
            <Input id="vatNumber" placeholder="FR12900123456" {...register('vatNumber')} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
          <input type="checkbox" className="size-4 rounded accent-brand-600" {...register('vatExempt')} />
          <span className="text-sm text-slate-700">
            Franchise en base de TVA (auto-entrepreneur) — mention « TVA non applicable, art. 293 B
            du CGI »
          </span>
        </label>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Assurance décennale</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Obligatoire pour les métiers du bâtiment (loi n° 2014-344).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assureur" htmlFor="insuranceName">
            <Input id="insuranceName" placeholder="AXA France" {...register('insuranceName')} />
          </Field>
          <Field label="N° de contrat" htmlFor="insuranceContract">
            <Input id="insuranceContract" placeholder="N° 123456789" {...register('insuranceContract')} />
          </Field>
          <Field label="Couverture géographique" htmlFor="insuranceCoverage" className="sm:col-span-2">
            <Input id="insuranceCoverage" placeholder="France métropolitaine" {...register('insuranceCoverage')} />
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">Médiation de la consommation</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Obligatoire pour les devis aux particuliers (art. L612-1 du code de la consommation).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Médiateur" htmlFor="mediatorName">
            <Input id="mediatorName" placeholder="CM2C" {...register('mediatorName')} />
          </Field>
          <Field label="Site du médiateur" htmlFor="mediatorUrl" error={errors.mediatorUrl?.message}>
            <Input id="mediatorUrl" placeholder="https://cm2c.net" invalid={!!errors.mediatorUrl} {...register('mediatorUrl')} />
          </Field>
        </div>

        <SaveRow saved={saved} saving={saving} error={error} />
      </form>
    </Card>
  );
}

// Choix du métier + grille tarifaire (persistés via l'API : company.metier + price_items).
function CatalogSection() {
  const { activeMembership, refreshSession } = useAuth();
  const companyMetier = activeMembership?.company.metier ?? null;

  const { data: apiItems, loading, error: loadError } = useApi<CatalogItem[]>('/api/v1/pricing/items');
  const [metier, setMetier] = useState<TradeId | null>(companyMetier);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialise la grille depuis l'API (une fois chargée).
  useEffect(() => {
    if (apiItems) setItems(apiItems);
  }, [apiItems]);

  const trade = getTrade(metier);
  const touch = () => {
    setSaved(false);
    setSaveError('');
  };

  // Choisir un métier : sur un catalogue vide, on pré-remplit avec ses prestations types.
  const chooseMetier = (id: TradeId) => {
    setMetier(id);
    setItems((prev) => (prev.length === 0 ? presetCatalog(id) : prev));
    touch();
  };

  const loadPreset = () => {
    if (!metier) return;
    setItems((prev) => mergeCatalog(prev, presetCatalog(metier)));
    touch();
  };

  const updateItem = (id: string, patch: Partial<CatalogItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    touch();
  };
  const addItem = () => {
    setItems((prev) => [...prev, { id: uid(), label: '', unit: 'unit', unitPrice: 0 }]);
    touch();
  };
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    touch();
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const body = items
        .filter((it) => it.label.trim())
        .map(({ label, unit, unitPrice }) => ({ label, unit, unitPrice }));
      const savedItems = await api.put<CatalogItem[]>('/api/v1/pricing/items', body);
      setItems(savedItems);
      if (metier && metier !== companyMetier) {
        await api.patch('/api/v1/companies/current', { metier });
        await refreshSession();
      }
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Chargement du catalogue…</p>;
  }
  if (loadError) {
    return (
      <p className="py-10 text-center text-sm text-rose-600">
        Impossible de charger le catalogue : {loadError}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-brand-100 bg-brand-50">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <ClipboardList className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-800">Votre catalogue de prestations</p>
            <p className="mt-1 text-sm text-brand-700">
              Choisissez votre métier : la grille se pré-remplit avec les prestations les plus
              courantes (unités et prix indicatifs). Vous ajustez tout ce que vous voulez, puis elle
              alimente vos devis et le chiffrage IA.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Votre métier" subtitle="Sélectionnez l'activité qui vous correspond." />
        <TradePicker value={metier} onChange={chooseMetier} />
      </Card>

      {metier && (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Grille tarifaire</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {items.length} prestation{items.length !== 1 ? 's' : ''}
                {trade && <> · TVA conseillée&nbsp;: {formatPercent(trade.vatRate)}</>}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={loadPreset}>
              <Wand2 className="size-4" />
              Prestations types
            </Button>
          </div>

          <div className="space-y-2 px-5 py-4">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Aucune prestation. Ajoutez-en une ou chargez les prestations types du métier.
              </p>
            ) : (
              items.map((it) => (
                <div key={it.id} className="flex items-center gap-2">
                  <Input
                    value={it.label}
                    onChange={(e) => updateItem(it.id, { label: e.target.value })}
                    placeholder="Désignation de la prestation"
                    className="flex-1"
                  />
                  <Select
                    value={it.unit}
                    onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                    className="w-24"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.unitPrice || ''}
                      onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}
                      placeholder="PU HT"
                      className="w-24"
                    />
                    <span className="text-sm text-slate-400">€</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Supprimer la prestation"
                    onClick={() => removeItem(it.id)}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={addItem}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="size-4" /> Ajouter une prestation
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
            <Button onClick={save} loading={saving}>
              Enregistrer le catalogue
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                <Check className="size-4" />
                Catalogue enregistré
              </span>
            )}
            {saveError && <span className="text-sm text-rose-600">{saveError}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}

type Zone = { id: string; postalCode: string; label: string };

// Zone d'intervention : les codes postaux desservis (filtre d'éligibilité du chat).
function ZoneSection() {
  const { data: apiZones, loading, error } = useApi<Zone[]>('/api/v1/zones');
  const [codes, setCodes] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (apiZones) setCodes(apiZones.map((z) => z.postalCode));
  }, [apiZones]);

  const addCode = () => {
    const code = draft.trim();
    if (!/^\d{5}$/.test(code)) {
      setSaveError(`« ${code} » n'est pas un code postal valide (5 chiffres).`);
      return;
    }
    setSaveError('');
    setSaved(false);
    if (!codes.includes(code)) setCodes((prev) => [...prev, code].sort());
    setDraft('');
  };

  const removeCode = (code: string) => {
    setCodes((prev) => prev.filter((c) => c !== code));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await api.put('/api/v1/zones', codes.map((postalCode) => ({ postalCode })));
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || error) return null; // la grille au-dessus affiche déjà l'état d'erreur

  return (
    <Card padded={false}>
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-brand-600" />
          <h2 className="text-base font-semibold text-slate-900">Zone d'intervention</h2>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          Les codes postaux où vous intervenez. Hors zone, le chat transmet la demande en
          prospect à rappeler au lieu de chiffrer un devis.
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCode();
              }
            }}
            placeholder="Ex. 75011"
            inputMode="numeric"
            className="max-w-[140px]"
          />
          <Button size="sm" variant="secondary" onClick={addCode}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </div>

        {codes.length === 0 ? (
          <p className="mt-4 text-sm text-amber-600">
            Aucun code postal : le chat ne pourra pas chiffrer de devis tant que votre zone
            n'est pas définie.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {codes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
              >
                {code}
                <button
                  type="button"
                  aria-label={`Retirer ${code}`}
                  onClick={() => removeCode(code)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
        <Button onClick={save} loading={saving}>
          Enregistrer la zone
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="size-4" />
            Zone enregistrée
          </span>
        )}
        {saveError && <span className="text-sm text-rose-600">{saveError}</span>}
      </div>
    </Card>
  );
}


const NOTIFICATIONS = [
  { id: 'new_lead', label: 'Nouveau prospect', desc: 'Un prospect remplit votre widget.' },
  { id: 'quote_accepted', label: 'Devis accepté', desc: 'Un client accepte un devis envoyé.' },
  { id: 'quote_refused', label: 'Devis refusé', desc: 'Un client refuse un devis envoyé.' },
  { id: 'weekly', label: 'Récapitulatif hebdomadaire', desc: 'Un résumé de votre activité chaque lundi.' },
];

function NotificationsSection() {
  // Préférences persistées sur le profil (GET /me → PATCH /me).
  const { data: me, loading } = useApi<{ notification_prefs: Record<string, boolean> }>(
    '/api/v1/auth/me',
  );
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (me) setEnabled(me.notification_prefs);
  }, [me]);

  const toggle = async (id: string, value: boolean) => {
    const next = { ...enabled, [id]: value };
    setEnabled(next);
    setSaveState('saving');
    try {
      await api.patch('/api/v1/auth/me', { notification_prefs: next });
      setSaveState('saved');
    } catch {
      setSaveState('error');
      setEnabled(enabled); // revient à l'état précédent
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-slate-400">Chargement…</p>;

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader
        title="Notifications par email"
        subtitle="Choisissez ce que vous recevez. Vos préférences sont enregistrées automatiquement."
      />
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {NOTIFICATIONS.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <Toggle
              checked={enabled[item.id] ?? false}
              onChange={(v) => toggle(item.id, v)}
              label={item.label}
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs">
        {saveState === 'saved' && <span className="text-emerald-600">Préférences enregistrées ✓</span>}
        {saveState === 'error' && (
          <span className="text-rose-600">Échec de l'enregistrement, réessayez.</span>
        )}
      </p>
    </Card>
  );
}
