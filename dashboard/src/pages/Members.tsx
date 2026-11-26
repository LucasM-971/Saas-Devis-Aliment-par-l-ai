import { useEffect, useState } from 'react';
import { Check, Mail, MoreHorizontal, Plus, Trash2, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { ASSIGNABLE_ROLES, canManageMembers, ROLE_META } from '@/lib/roles';
import type { Role, TeamMember } from '@/types';

export default function Members() {
  const { data } = useApi<TeamMember[]>('/api/v1/members');
  const { user, activeMembership } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  useEffect(() => setMembers(data ?? []), [data]);

  const canManage = canManageMembers(activeMembership?.role);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Modifie le rôle d'un membre. Mise à jour optimiste puis persistée via l'API.
  const changeRole = (member: TeamMember, role: Role) => {
    if (member.role === role) return;
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
    api.patch(`/api/v1/members/${member.id}`, { role }).catch(() => {});
  };

  // Retire un membre de l'espace (ou révoque une invitation en attente).
  const remove = (member: TeamMember) => {
    const label = member.status === 'invited' ? member.email : member.name;
    if (!window.confirm(`Retirer ${label} de cet espace de travail ?`)) return;
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    api.delete(`/api/v1/members/${member.id}`).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Membres"
        subtitle="Les personnes ayant accès à cet espace de travail."
        action={
          canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
              <Plus className="size-4" />
              Inviter
            </Button>
          ) : undefined
        }
      />

      <Card padded={false}>
        {members.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="Aucun membre"
            description="Invitez vos collaborateurs pour leur donner accès à cet espace."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((member) => {
              const isSelf = !!user && member.email === user.email;
              // Owner et sa propre ligne non modifiables
              const locked = member.role === 'owner' || isSelf;
              return (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5"
                >
                  <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {initials(member.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {member.status === 'invited' ? member.email : member.name}
                        {isSelf && <span className="font-normal text-slate-400"> (vous)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-400">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                    {member.status === 'invited' && (
                      <Badge tone="amber">
                        <Mail className="size-3" />
                        Invité
                      </Badge>
                    )}
                    <Badge tone={ROLE_META[member.role].tone}>{ROLE_META[member.role].label}</Badge>
                    {canManage && !locked && (
                      <Dropdown
                        trigger={
                          <span
                            aria-label={`Gérer ${member.name}`}
                            className="grid size-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                          >
                            <MoreHorizontal className="size-4" />
                          </span>
                        }
                      >
                        {(close) => (
                          <>
                            <p className="px-3 pb-1 pt-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                              Rôle
                            </p>
                            {ASSIGNABLE_ROLES.map((role) => (
                              <DropdownItem
                                key={role}
                                active={member.role === role}
                                onClick={() => {
                                  changeRole(member, role);
                                  close();
                                }}
                              >
                                {member.role === role ? (
                                  <Check className="size-4" />
                                ) : (
                                  <span className="size-4" />
                                )}
                                {ROLE_META[role].label}
                              </DropdownItem>
                            ))}
                            <div className="my-1 border-t border-slate-100" />
                            <DropdownItem
                              className="text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                close();
                                remove(member);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Retirer de l'espace
                            </DropdownItem>
                          </>
                        )}
                      </Dropdown>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!canManage && (
        <p className="mt-3 text-xs text-slate-400">
          Seuls les propriétaires et administrateurs peuvent inviter, modifier ou retirer des
          membres.
        </p>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(invited) => setMembers((prev) => [...prev, invited])}
      />
    </div>
  );
}

// Courte description du périmètre de chaque rôle attribuable, affichée sous le sélecteur.
const ROLE_HINTS: Record<Role, string> = {
  owner: 'Contrôle total de l’espace et de la facturation.',
  admin: 'Gère l’équipe, les devis, les prospects et la configuration.',
  member: 'Crée et gère les devis et les prospects.',
  viewer: 'Consultation seule, sans modification.',
};

// Modal d'invitation par e-mail.
function InviteModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (member: TeamMember) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole('member');
    setError('');
    setSaving(false);
  }, [open]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return setError('Indiquez une adresse e-mail.');
    setSaving(true);
    setError('');
    try {
      const inv = await api.post<{ id: string; email: string; role: Role }>('/api/v1/invitations', {
        email: trimmed,
        role,
      });
      // Invitations préfixées « i »
      onInvited({ id: `i${inv.id}`, name: inv.email, email: inv.email, role: inv.role, status: 'invited' });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={onClose}>
        Annuler
      </Button>
      <Button size="sm" onClick={submit} loading={saving}>
        <Mail className="size-4" />
        Envoyer l’invitation
      </Button>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} size="md" title="Inviter un membre" footer={footer}>
      <div className="grid gap-4">
        <Field label="Adresse e-mail" htmlFor="inv-email" required>
          <Input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="collaborateur@entreprise.fr"
          />
        </Field>
        <Field label="Rôle" htmlFor="inv-role" hint={ROLE_HINTS[role]}>
          <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </Select>
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
