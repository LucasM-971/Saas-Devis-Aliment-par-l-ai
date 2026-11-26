import { FileText, Sparkles, SlidersHorizontal, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/components/ui/Badge';
import type { AuditEntry, AuditType } from '@/types';
import { formatDate } from './format';

// Icône et couleur associées à chaque type d'événement.
export const AUDIT_TYPE_META: Record<AuditType, { icon: LucideIcon; tone: Tone }> = {
  quote: { icon: FileText, tone: 'brand' },
  ai: { icon: Sparkles, tone: 'blue' },
  pricing: { icon: SlidersHorizontal, tone: 'amber' },
  lead: { icon: UserPlus, tone: 'green' },
  member: { icon: Users, tone: 'slate' },
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Libellé de jour relatif : « Aujourd'hui », « Hier » ou date longue.
export function relativeDayLabel(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return formatDate(iso);
}

export type AuditGroup = { key: string; label: string; entries: AuditEntry[] };

// Regroupe les entrées par jour, du plus récent au plus ancien.
export function groupAuditByDay(entries: AuditEntry[], now: Date = new Date()): AuditGroup[] {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups: AuditGroup[] = [];
  for (const entry of sorted) {
    const key = entry.createdAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, label: relativeDayLabel(entry.createdAt, now), entries: [entry] });
  }
  return groups;
}
