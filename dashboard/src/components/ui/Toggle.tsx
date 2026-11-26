import { cn } from '@/lib/cn';

type Props = { checked: boolean; onChange: (checked: boolean) => void; label?: string };

// Interrupteur on/off accessible (réglages, notifications).
export function Toggle({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-slate-200',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 transform rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
