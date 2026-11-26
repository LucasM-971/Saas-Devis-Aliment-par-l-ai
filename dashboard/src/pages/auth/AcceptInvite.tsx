import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ROLE_META } from '@/lib/roles';
import type { Role } from '@/types';

type Lookup = {
  email: string;
  companyName: string;
  role: Role;
  inviterName: string | null;
  userExists: boolean;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; invite: Lookup }
  | { status: 'invalid' };

// Acceptation d'une invitation d'équipe : le lien (token) prouve l'adresse.
// Nouveau venu → création du compte ; compte existant → mot de passe actuel.
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { refreshSession } = useAuth();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid' });
      return;
    }
    let cancelled = false;
    api
      .get<Lookup>(`/api/v1/invitations/lookup/${token}`)
      .then((invite) => !cancelled && setState({ status: 'ready', invite }))
      .catch(() => !cancelled && setState({ status: 'invalid' }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    if (state.status !== 'ready') return;
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setAccepting(true);
    setError('');
    try {
      const { access_token } = await api.post<{ access_token: string }>(
        '/api/v1/invitations/accept',
        {
          token,
          password,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        },
      );
      // Ouvre la session avec le token renvoyé puis recharge le profil.
      localStorage.setItem('devis-ai-auth', JSON.stringify({ token: access_token }));
      await refreshSession();
      navigate('/app');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <AuthCard title="Invitation">
        <div className="flex justify-center py-6 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </AuthCard>
    );
  }

  if (state.status === 'invalid') {
    return (
      <AuthCard
        title="Invitation invalide"
        subtitle="Ce lien est invalide, expiré ou déjà utilisé. Demandez une nouvelle invitation à votre équipe."
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

  const { invite } = state;

  return (
    <AuthCard title="Invitation à rejoindre une équipe">
      <p className="text-center text-sm text-slate-600">
        <span className="font-medium text-slate-900">{invite.inviterName ?? 'Un membre'}</span>{' '}
        vous invite à rejoindre{' '}
        <span className="font-medium text-slate-900">{invite.companyName}</span> en tant que{' '}
        <span className="font-medium text-brand-600">{ROLE_META[invite.role].label}</span>.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <Field label="Email" htmlFor="invite-email">
          <Input id="invite-email" value={invite.email} disabled />
        </Field>

        {!invite.userExists && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="invite-first">
              <Input
                id="invite-first"
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <Field label="Nom" htmlFor="invite-last">
              <Input id="invite-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
        )}

        <Field
          label={invite.userExists ? 'Votre mot de passe' : 'Choisissez un mot de passe'}
          htmlFor="invite-password"
          required
          hint={
            invite.userExists
              ? 'Un compte existe déjà avec cet email : confirmez votre mot de passe.'
              : '8 caractères minimum.'
          }
        >
          <Input
            id="invite-password"
            type="password"
            autoComplete={invite.userExists ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" onClick={accept} loading={accepting}>
            Accepter l'invitation
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>
            Refuser
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
