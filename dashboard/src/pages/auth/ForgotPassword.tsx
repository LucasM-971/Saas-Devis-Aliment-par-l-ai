import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { forgotSchema, type ForgotValues } from '@/lib/validation/auth';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setApiError('');
    try {
      // Répond toujours 204, qu'un compte existe ou non (pas d'énumération).
      await api.post('/api/v1/auth/forgot-password', { email: values.email });
      setSent(true);
    } catch (e) {
      setApiError((e as Error).message);
    }
  });

  if (sent) {
    return (
      <AuthCard
        title="Vérifiez vos emails"
        subtitle="Si un compte existe, un lien de réinitialisation vient d'être envoyé."
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex justify-center py-2 text-emerald-500">
          <MailCheck className="size-12" strokeWidth={1.5} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="On vous envoie un lien pour le réinitialiser"
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.fr"
            invalid={!!errors.email}
            {...register('email')}
          />
        </Field>
        {apiError && <p className="text-sm text-rose-600">{apiError}</p>}
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Envoyer le lien
        </Button>
      </form>
    </AuthCard>
  );
}
