import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// États asynchrones partagés par les pages branchées sur l'API.

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-rose-50 text-rose-500">
        <WifiOff className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">Impossible de charger les données</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {message || "Le serveur ne répond pas. Vérifiez que l'API est démarrée."}
        </p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="size-4" /> Réessayer
        </Button>
      )}
    </div>
  );
}
