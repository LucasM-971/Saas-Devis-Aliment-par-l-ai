import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
};

const sizes = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

// Fenêtre modale centrée. Ferme sur Échap ou clic sur le fond.
export function Modal({ open, onClose, title, size = 'lg', children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-card bg-surface shadow-pop',
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
