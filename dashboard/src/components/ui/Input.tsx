import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ className, invalid, ...props }: Props) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 transition-colors',
        'placeholder:text-slate-400 focus:outline-none focus:ring-2',
        invalid
          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
          : 'border-slate-200 focus:border-brand-500 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}
