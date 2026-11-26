import { PageHeader } from '@/components/PageHeader';
import { PlanManager } from '@/components/PlanManager';

export default function Subscription() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Abonnement"
        subtitle="Votre plan, votre quota de devis et les fonctionnalités débloquées."
      />
      <PlanManager />
    </div>
  );
}
