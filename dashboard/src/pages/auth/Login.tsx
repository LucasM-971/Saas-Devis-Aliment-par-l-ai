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
import { loginSchema, type LoginValues } from '@/lib/validation/auth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    await login(email, password);
    navigate('/app');
  });

  return (
    <AuthCard
      title="Connexion"
      subtitle="Accédez à votre espace Devis AI"
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Créer un compte
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
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>

        <div className="flex items-center justify-between">
          <Checkbox id="stayLogged" label="Rester connecté" {...register('stayLogged')} />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Se connecter
        </Button>
      </form>

      <DevBypassButton />
    </AuthCard>
  );
}
