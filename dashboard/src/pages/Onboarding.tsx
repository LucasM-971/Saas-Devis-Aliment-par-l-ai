import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Building2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { TradePicker } from '@/components/TradePicker';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { presetCatalog } from '@/lib/catalog';
import { getTrade, type CatalogItem, type TradeId } from '@/lib/trades';
import { formatPercent } from '@/lib/format';
import { newCompanySchema, type NewCompanyValues } from '@/lib/validation/settings';

const PLACEHOLDER_NAME = 'Mon entreprise';

// Onboarding post-inscription : l'artisan choisit son métier (pré-remplit le
// catalogue) puis renseigne son entreprise. Toutes les données sont persistées
// en base via l'API (company.metier + price_items + infos entreprise).
export default function Onboarding() {
  const { user, activeMembership, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [metier, setMetier] = useState<TradeId | null>(
    activeMembership?.company.metier ?? null,
  );
  const [savingMetier, setSavingMetier] = useState(false);
  const [error, setError] = useState('');

  const currentName = activeMembership?.company.name ?? '';
  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<NewCompanyValues>({
    resolver: zodResolver(newCompanySchema),
    defaultValues: {
      name: currentName === PLACEHOLDER_NAME ? '' : currentName,
      address: activeMembership?.company.address ?? '',
      contactEmail: activeMembership?.company.contactEmail ?? user?.email ?? '',
      contactPhone: activeMembership?.company.contactPhone ?? '',
    },
  });

  const trade = getTrade(metier);

  // Étape 1 → 2 : enregistre le métier et pré-remplit le catalogue s'il est vide.
  const confirmMetier = async () => {
    if (!metier) return;
    setSavingMetier(true);
    setError('');
    try {
      const existing = await api.get<CatalogItem[]>('/api/v1/pricing/items');
      if (existing.length === 0) {
        const seed = presetCatalog(metier).map(({ label, unit, unitPrice }) => ({
          label,
          unit,
          unitPrice,
        }));
        await api.put('/api/v1/pricing/items', seed);
      }
      await api.patch('/api/v1/companies/current', { metier });
      await refreshSession();
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingMetier(false);
    }
  };

  // Étape 2 : enregistre les infos entreprise puis bascule sur le tableau de bord.
  // `full` inclut les champs optionnels ; sinon on ne pousse que le nom (requis).
  const saveCompany = async (full: boolean) => {
    if (!(await trigger('name'))) return;
    setError('');
    const v = getValues();
    // Le backend attend du camelCase (schéma aligné sur le type Company du front).
    const payload: Record<string, string> = { name: v.name.trim() };
    if (full) {
      if (v.address?.trim()) payload.address = v.address.trim();
      if (v.contactEmail?.trim()) payload.contactEmail = v.contactEmail.trim();
      if (v.contactPhone?.trim()) payload.contactPhone = v.contactPhone.trim();
    }
    try {
      await api.patch('/api/v1/companies/current', payload);
      await refreshSession();
      navigate('/app');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Stepper step={step} />

        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        )}

        {step === 1 && (
          <Card>
            <h1 className="text-xl font-semibold text-slate-900">Bienvenue&nbsp;! Quel est votre métier&nbsp;?</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Votre grille tarifaire se pré-remplit avec les prestations types de votre métier. Vous
              pourrez tout ajuster ensuite.
            </p>

            <div className="mt-6">
              <TradePicker value={metier} onChange={setMetier} columns={3} />
            </div>

            {trade && (
              <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                Sélection&nbsp;: {presetCatalog(trade.id).length} prestations pré-remplies (unités et
                prix indicatifs) · TVA conseillée&nbsp;: {formatPercent(trade.vatRate)}.
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <Button size="lg" disabled={!metier} loading={savingMetier} onClick={confirmMetier}>
                Continuer
              </Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
                <Building2 className="size-5" />
              </span>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Votre entreprise</h1>
                <p className="text-sm text-slate-500">
                  Ces informations apparaîtront sur vos devis. Vous pouvez compléter plus tard depuis
                  les Réglages.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit(() => saveCompany(true))} className="flex flex-col gap-4" noValidate>
              <Field label="Nom de l'entreprise" htmlFor="name" required error={errors.name?.message}>
                <Input id="name" invalid={!!errors.name} placeholder="Plomberie Martin" {...register('name')} />
              </Field>
              <Field label="Adresse" htmlFor="address" error={errors.address?.message}>
                <Input id="address" placeholder="12 rue des Artisans, 69003 Lyon" {...register('address')} />
              </Field>
              <Field label="Email de contact" htmlFor="contactEmail" error={errors.contactEmail?.message}>
                <Input
                  id="contactEmail"
                  type="email"
                  invalid={!!errors.contactEmail}
                  placeholder="contact@entreprise.fr"
                  {...register('contactEmail')}
                />
              </Field>
              <Field label="Téléphone" htmlFor="contactPhone" error={errors.contactPhone?.message}>
                <Input id="contactPhone" placeholder="06 12 34 56 78" {...register('contactPhone')} />
              </Field>

              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => saveCompany(false)}
                  className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  Compléter plus tard
                </button>
                <Button type="submit" size="lg" loading={isSubmitting}>
                  Terminer
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

// Indicateur d'étapes 1 → 2.
function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6 flex items-center gap-3 text-xs text-slate-500">
      <Dot n={1} state={step > 1 ? 'done' : 'current'} />
      <span className="h-px flex-1 bg-slate-200" />
      <Dot n={2} state={step === 2 ? 'current' : 'todo'} />
      <span className="ml-1">Étape {step} sur 2</span>
    </div>
  );
}

function Dot({ n, state }: { n: number; state: 'todo' | 'current' | 'done' }) {
  return (
    <span
      className={
        state === 'todo'
          ? 'grid size-6 place-items-center rounded-full border border-slate-300 text-slate-400'
          : 'grid size-6 place-items-center rounded-full bg-brand-600 text-white'
      }
    >
      {state === 'done' ? <Check className="size-3.5" /> : n}
    </span>
  );
}
