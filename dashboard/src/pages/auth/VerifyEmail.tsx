import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/AuthCard';

export default function VerifyEmail() {
  const [verified, setVerified] = useState(false);

  // Simule la vérification du jeton reçu par email (pas de backend).
  useEffect(() => {
    const timer = setTimeout(() => setVerified(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthCard
      title={verified ? 'Email vérifié' : 'Vérification en cours'}
      subtitle={
        verified
          ? 'Votre adresse email a bien été confirmée.'
          : 'Merci de patienter quelques instants…'
      }
      footer={
        verified ? (
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Aller à la connexion
          </Link>
        ) : undefined
      }
    >
      <div className="flex justify-center py-2">
        {verified ? (
          <CheckCircle2 className="size-12 text-emerald-500" strokeWidth={1.5} />
        ) : (
          <Loader2 className="size-12 animate-spin text-brand-500" strokeWidth={1.5} />
        )}
      </div>
    </AuthCard>
  );
}
