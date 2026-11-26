import type { ButtonHTMLAttributes, Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { buttonClasses, type Size, type Variant } from './button-variants';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
