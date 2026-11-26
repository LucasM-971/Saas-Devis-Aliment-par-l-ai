import type { Ref, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

type Props = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

// Liste déroulante native stylée pour les formulaires.
export function Select({ className, children, ...props }: Props) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm text-slate-900',
          'transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
