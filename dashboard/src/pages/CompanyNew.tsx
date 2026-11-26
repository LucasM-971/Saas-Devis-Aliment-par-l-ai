import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { newCompanySchema, type NewCompanyValues } from '@/lib/validation/settings';

// Création d'un nouvel espace entreprise.
export default function CompanyNew() {
  const { addCompany } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewCompanyValues>({
    resolver: zodResolver(newCompanySchema),
    defaultValues: { name: '', address: '', contactEmail: '', contactPhone: '' },
  });

  const onSubmit = async (values: NewCompanyValues) => {
    setApiError('');
    try {
      // Crée l'espace via l'API et bascule dessus, puis retour au tableau de bord.
      await addCompany(values);
      navigate('/app');
    } catch (e) {
      // Notamment la gate premium : plusieurs entreprises = plan Premium.
      setApiError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Nouvelle entreprise"
        subtitle="Créez un espace indépendant avec ses propres devis, prospects et catalogue."
      />

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" />
        Retour
      </button>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
            <Building2 className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Informations de l'entreprise</h2>
            <p className="text-sm text-slate-500">Ces informations apparaîtront sur vos devis.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Raison sociale" htmlFor="name" required error={errors.name?.message}>
            <Input
              id="name"
              autoFocus
              placeholder="Ex. Atelier Martin"
              invalid={!!errors.name}
              {...register('name')}
            />
          </Field>
          <Field label="Adresse" htmlFor="address" error={errors.address?.message}>
            <Input
              id="address"
              placeholder="12 rue des Artisans, 69001 Lyon"
              {...register('address')}
            />
          </Field>
          <Field label="Email de contact" htmlFor="contactEmail" error={errors.contactEmail?.message}>
            <Input
              id="contactEmail"
              type="email"
              placeholder="contact@entreprise.fr"
              invalid={!!errors.contactEmail}
              {...register('contactEmail')}
            />
          </Field>
          <Field label="Téléphone" htmlFor="contactPhone" error={errors.contactPhone?.message}>
            <Input id="contactPhone" placeholder="06 12 34 56 78" {...register('contactPhone')} />
          </Field>

          {apiError && <p className="text-sm text-rose-600">{apiError}</p>}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" loading={isSubmitting}>
              Créer l'entreprise
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Annuler
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
