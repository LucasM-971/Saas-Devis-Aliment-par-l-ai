import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Props = {
  trigger: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  children: (close: () => void) => ReactNode;
};

// Menu déroulant générique : ferme au clic extérieur ou sur un élément.
export function Dropdown({ trigger, align = 'right', className, children }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="block">
        {trigger}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={close}
          />
          <div
            className={cn(
              'absolute z-20 mt-2 min-w-56 rounded-xl border border-slate-200 bg-surface p-1.5 shadow-pop',
              align === 'right' ? 'right-0' : 'left-0',
              className,
            )}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

type ItemProps = {
  onClick?: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
};

export function DropdownItem({ onClick, active, className, children }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
        className,
      )}
    >
      {children}
    </button>
  );
}
