import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/AuthCard';
import { DevBypassButton } from '@/components/DevBypassButton';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { registerSchema, type RegisterValues } from '@/lib/validation/auth';

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    await registerUser({ email, password });
    // Compte neuf → onboarding (choix du métier + infos entreprise).
    navigate('/onboarding');
  });

  return (
    <AuthCard
      title="Créer un compte"
      subtitle="Quelques secondes suffisent"
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Se connecter
          </Link>
        </>
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

        <div>
          <Checkbox
            id="rgpd"
            label="J'accepte les conditions d'utilisation et la politique RGPD"
            {...register('rgpd')}
          />
          {errors.rgpd && <p className="mt-1 text-xs text-rose-600">{errors.rgpd.message}</p>}
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Créer mon compte
        </Button>
      </form>

      <DevBypassButton />
    </AuthCard>
  );
}
