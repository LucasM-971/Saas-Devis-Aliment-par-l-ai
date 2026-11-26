import { Badge } from '@/components/ui/Badge';
import { STATUS_META } from '@/lib/quote-status';
import type { QuoteStatus } from '@/types';

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const { label, tone } = STATUS_META[status];
  return <Badge tone={tone}>{label}</Badge>;
}
