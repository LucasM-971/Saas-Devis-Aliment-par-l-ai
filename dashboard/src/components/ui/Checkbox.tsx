import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  ref?: Ref<HTMLInputElement>;
};

export function Checkbox({ label, className, id, ...props }: Props) {
  return (
    <label htmlFor={id} className={cn('flex items-center gap-2 text-sm text-slate-600', className)}>
      <input
        id={id}
        type="checkbox"
        className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        {...props}
      />
      {label}
    </label>
  );
}
