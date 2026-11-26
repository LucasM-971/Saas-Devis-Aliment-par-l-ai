import { Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

// Champ de recherche avec icône, contrôlé par le parent.
export function SearchInput({ value, onChange, placeholder = 'Rechercher…', className }: Props) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
