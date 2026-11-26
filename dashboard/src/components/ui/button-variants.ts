import { cn } from '@/lib/cn';

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
};

// Classes partagées entre <Button> et les liens stylés en bouton.
export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}
