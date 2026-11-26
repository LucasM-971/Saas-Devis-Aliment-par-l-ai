import { cn } from '@/lib/cn';

type Props = { showText?: boolean; className?: string };

// Marque Devis AI : pastille indigo (lignes = un devis) + nom du produit.
export function Logo({ showText = true, className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <path
            d="M6 7h11M6 12h13M6 17h8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {showText && (
        <span className="text-[15px] font-medium text-slate-900">
          Devis AI
        </span>
      )}
    </span>
  );
}
