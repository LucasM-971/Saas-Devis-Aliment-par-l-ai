import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { resetSchema, type ResetValues } from '@/lib/validation/auth';

export default function ResetPassword() {
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState('');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setApiError('');
    try {
      await api.post('/api/v1/auth/reset-password', { token, password: values.password });
      setDone(true);
    } catch (e) {
      setApiError((e as Error).message);
    }
  });

  if (!token) {
    return (
      <AuthCard
        title="Lien invalide"
        subtitle="Ce lien de réinitialisation est incomplet. Refaites une demande depuis « Mot de passe oublié »."
        footer={
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
            Demander un nouveau lien
          </Link>
        }
      >
        <span />
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title="Mot de passe modifié"
        subtitle="Vous pouvez maintenant vous connecter avec votre nouveau mot de passe."
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Aller à la connexion
          </Link>
        }
      >
        <span />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Choisissez un mot de passe sécurisé">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Mot de passe" htmlFor="password" required error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="8 caractères minimum"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Field
          label="Confirmer le mot de passe"
          htmlFor="confirmPassword"
          required
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            invalid={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
        </Field>
        {apiError && <p className="text-sm text-rose-600">{apiError}</p>}
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Réinitialiser
        </Button>
      </form>
    </AuthCard>
  );
}
