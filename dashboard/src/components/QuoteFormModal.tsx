import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Download, Plus, Send, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { computeQuoteTotals } from '@/lib/quote-math';
import { buildQuotePdf, type PdfCompany } from '@/lib/quote-pdf';
import { formatCurrency, formatPercent } from '@/lib/format';
import { nextActions } from '@/lib/quote-status';
import { UNIT_OPTIONS, unitLabel } from '@/lib/units';
import { cn } from '@/lib/cn';
import { ConversationThread } from '@/components/chat/ConversationModal';
import type { DiscountType, Quote, QuoteDraft, QuoteStatus, QuoteTemplate } from '@/types';

type LineDraft = { label: string; unit: string; quantity: string; unitPrice: string };
type PriceItem = { id: string; label: string; unit: string; unitPrice: number };
// Émetteur par défaut si aucune entreprise active (référence stable pour l'effet PDF).
const FALLBACK_COMPANY: PdfCompany = { name: 'Mon entreprise' };
const VAT_OPTIONS = [0.2, 0.1, 0.055, 0];
const emptyLine = (): LineDraft => ({ label: '', unit: 'unit', quantity: '1', unitPrice: '' });

type Props = {
  open: boolean;
  quote: Quote | null; // null = création
  draft?: QuoteDraft | null; // pré-remplissage après import d'un fichier (création only)
  onClose: () => void;
  onSaved: () => void;
};

export function QuoteFormModal({ open, quote, draft, onClose, onSaved }: Props) {
  const { activeMembership } = useAuth();
  // Objet entreprise complet (identité + mentions légales) transmis au PDF.
  const company: PdfCompany = activeMembership?.company ?? FALLBACK_COMPANY;
  // Un devis conforme exige l'identité de l'émetteur : on alerte si elle manque.
  const missingLegal =
    !('siret' in company && company.siret) || !('address' in company && company.address);
  const { data: grille } = useApi<PriceItem[]>('/api/v1/pricing/items');
  const { data: template } = useApi<QuoteTemplate>('/api/v1/quote-templates');

  const [tab, setTab] = useState<'edit' | 'preview' | 'chat'>('edit');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [vatRate, setVatRate] = useState(0.2);
  const [discountType, setDiscountType] = useState<DiscountType | ''>('');
  const [discountValue, setDiscountValue] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Initialise le formulaire : devis édité, sinon brouillon importé, sinon vide.
  useEffect(() => {
    if (!open) return;
    setTab('edit');
    setError('');
    // En création, un brouillon importé sert de source de pré-remplissage.
    const src = quote ?? (draft && !quote ? draft : null);
    setClientName(src?.clientName ?? '');
    setClientEmail(src?.clientEmail ?? '');
    setVatRate(src?.vatRate ?? activeMembership?.company.defaultVatRate ?? 0.2);
    setDiscountType(quote?.discountType ?? '');
    setDiscountValue(quote?.discountValue ? String(quote.discountValue) : '');
    setNotes(src?.notes ?? '');
    setLines(
      src && src.lines.length
        ? src.lines.map((l) => ({
            label: l.label,
            unit: l.unit ?? 'unit',
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
          }))
        : [emptyLine()],
    );
  }, [open, quote, draft, activeMembership]);

  const parsed = useMemo(
    () =>
      lines.map((l) => ({
        label: l.label,
        unit: l.unit,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
      })),
    [lines],
  );

  const draftQuote: Quote = useMemo(
    () => ({
      id: quote?.id ?? 'draft',
      reference: quote?.reference ?? 'NOUVEAU',
      clientName: clientName || 'Client',
      clientEmail: clientEmail || undefined,
      status: quote?.status ?? 'brouillon',
      vatRate,
      discountType: discountType || null,
      discountValue: Number(discountValue) || 0,
      notes: notes || null,
      createdAt: quote?.createdAt ?? new Date().toISOString().slice(0, 10),
      lines: parsed.map((l, i) => ({ id: String(i), ...l })),
    }),
    [quote, clientName, clientEmail, vatRate, discountType, discountValue, notes, parsed],
  );

  const totals = useMemo(() => computeQuoteTotals(draftQuote), [draftQuote]);

  // Construit l'aperçu PDF (uniquement sur l'onglet Aperçu) à partir du brouillon courant.
  useEffect(() => {
    if (!open || tab !== 'preview') {
      setPdfUrl(null);
      return;
    }
    const url = buildQuotePdf(draftQuote, company, template ?? undefined).output('bloburl').toString();
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, tab, draftQuote, company, template]);

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Réordonne les postes (le devis final suit cet ordre).
  const moveLine = (i: number, dir: -1 | 1) =>
    setLines((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const validLines = parsed.filter((l) => l.label.trim() && l.quantity > 0);

  const save = async () => {
    if (!clientName.trim()) return setError('Le nom du client est requis.');
    if (validLines.length === 0) return setError('Ajoutez au moins une ligne valide.');
    setSaving(true);
    setError('');
    const body = {
      clientName,
      clientEmail: clientEmail || undefined,
      vatRate,
      discountType: discountType || null,
      discountValue: Number(discountValue) || 0,
      notes: notes || null,
      lines: validLines.map((l) => ({
        label: l.label,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    };
    try {
      if (quote) await api.patch(`/api/v1/quotes/${quote.id}`, body);
      else await api.post('/api/v1/quotes', body);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: QuoteStatus) => {
    if (!quote) return;
    await api.patch(`/api/v1/quotes/${quote.id}/status`, { status });
    onSaved();
    onClose();
  };

  // Envoie le devis au client par e-mail (le serveur passe le statut à « envoyé »).
  const [sending, setSending] = useState(false);
  const sendByEmail = async () => {
    if (!quote) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/api/v1/quotes/${quote.id}/send`);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // Supprime le brouillon (les devis engagés se clôturent via les statuts).
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (!quote) return;
    if (!window.confirm(`Supprimer définitivement le brouillon ${quote.reference} ?`)) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/v1/quotes/${quote.id}`);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => buildQuotePdf(draftQuote, company, template ?? undefined).save(`${draftQuote.reference}.pdf`)}
        >
          <Download className="size-4" />
          PDF
        </Button>
        {quote &&
          nextActions(quote.status).map((action) => (
            <Button
              key={action.to}
              size="sm"
              variant={action.variant}
              onClick={() => changeStatus(action.to)}
            >
              {action.label}
            </Button>
          ))}
        {quote?.status === 'pret' && quote.clientEmail && (
          <Button size="sm" onClick={sendByEmail} loading={sending}>
            <Send className="size-4" />
            Envoyer par e-mail
          </Button>
        )}
        {quote?.status === 'brouillon' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            loading={deleting}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="size-4" />
            Supprimer
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button size="sm" onClick={save} loading={saving}>
          Enregistrer
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={quote ? `Devis ${quote.reference}` : draft ? 'Devis importé — à vérifier' : 'Nouveau devis'}
      footer={footer}
    >
      {/* Onglets */}
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        {(quote?.conversationId ? (['edit', 'preview', 'chat'] as const) : (['edit', 'preview'] as const)).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 rounded-md py-1 text-sm font-medium transition-colors',
              tab === id ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {id === 'edit' ? 'Modifier' : id === 'preview' ? 'Aperçu PDF' : 'Conversation'}
          </button>
        ))}
      </div>

      {tab === 'edit' ? (
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-2.5 sm:grid-cols-2 [&>*]:min-w-0">
          {draft && !quote && (
            <div
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs sm:col-span-2',
                draft.parsed
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500',
              )}
            >
              {draft.parsed
                ? 'Devis pré-rempli depuis votre fichier — vérifiez les postes, quantités et prix avant d’enregistrer.'
                : 'Aucun poste n’a pu être détecté automatiquement. Ajoutez les lignes manuellement.'}
            </div>
          )}
          {missingLegal && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Pour un devis conforme à la loi française, renseignez le SIRET et l'adresse de
                votre entreprise dans Réglages — ils apparaissent dans les mentions légales du PDF.
              </span>
            </div>
          )}
          <Field label="Client" htmlFor="qf-client" required className="sm:col-span-2">
            <Input
              id="qf-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nom du client ou de l'entreprise"
            />
          </Field>
          <Field label="Email du client" htmlFor="qf-email">
            <Input
              id="qf-email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@email.fr"
            />
          </Field>
          <Field label="TVA" htmlFor="qf-vat">
            <Select id="qf-vat" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
              {VAT_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>
                  {formatPercent(rate)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Postes</p>
              {grille && grille.length > 0 && (
                <Select
                  value=""
                  onChange={(e) => {
                    const item = grille.find((g) => g.id === e.target.value);
                    if (item)
                      setLines((prev) => [
                        ...prev,
                        {
                          label: item.label,
                          unit: item.unit,
                          quantity: '1',
                          unitPrice: String(item.unitPrice),
                        },
                      ]);
                  }}
                  className="h-8 max-w-56"
                >
                  <option value="">+ Depuis la grille…</option>
                  {grille.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} ({unitLabel(g.unit)})
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 max-sm:border-b max-sm:border-slate-100 max-sm:pb-3 sm:flex-nowrap">
                  <Input
                    value={line.label}
                    onChange={(e) => updateLine(i, { label: e.target.value })}
                    placeholder="Désignation"
                    className="min-w-0 flex-1 max-sm:order-first max-sm:basis-full"
                  />
                  <Select
                    value={line.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                    className="w-[4.5rem] sm:w-24"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    placeholder="Qté"
                    className="w-14 sm:w-16"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                    placeholder="PU HT"
                    className="min-w-0 flex-1 sm:w-24 sm:flex-none"
                  />
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      aria-label="Monter la ligne"
                      onClick={() => moveLine(i, -1)}
                      disabled={i === 0}
                      className="text-slate-300 hover:text-slate-500 disabled:opacity-30"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descendre la ligne"
                      onClick={() => moveLine(i, 1)}
                      disabled={i === lines.length - 1}
                      className="text-slate-300 hover:text-slate-500 disabled:opacity-30"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="Supprimer la ligne"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={lines.length === 1}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="size-4" /> Ajouter une ligne
            </button>
          </div>

          {/* Remise globale */}
          <Field label="Remise" htmlFor="qf-discount-type">
            <div className="flex items-center gap-2">
              <Select
                id="qf-discount-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType | '')}
                className="w-36"
              >
                <option value="">Aucune</option>
                <option value="percent">Pourcentage</option>
                <option value="amount">Montant (€)</option>
              </Select>
              {discountType && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? '10' : '100'}
                    className="w-24"
                  />
                  <span className="text-sm text-slate-400">
                    {discountType === 'percent' ? '%' : '€'}
                  </span>
                </div>
              )}
            </div>
          </Field>
          <Field
            label="Conditions / mentions"
            htmlFor="qf-notes"
            hint="Affichées en bas du devis (acompte, délais, garanties…)."
          >
            <textarea
              id="qf-notes"
              rows={1}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. Acompte de 30 % à la commande."
              className="block min-h-10 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </Field>

          <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
            <div className="flex justify-between text-slate-500">
              <span>Total HT</span>
              <span className="tabular-nums font-medium text-slate-700">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>
            {totals.discount > 0 && (
              <>
                <div className="flex justify-between text-emerald-600">
                  <span>
                    Remise{discountType === 'percent' ? ` (${Number(discountValue) || 0} %)` : ''}
                  </span>
                  <span className="tabular-nums font-medium">−{formatCurrency(totals.discount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>HT après remise</span>
                  <span className="tabular-nums font-medium text-slate-700">
                    {formatCurrency(totals.netSubtotal)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between text-slate-500">
              <span>TVA ({formatPercent(vatRate)})</span>
              <span className="tabular-nums font-medium text-slate-700">
                {formatCurrency(totals.vat)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
              <span>Total TTC</span>
              <span className="tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
        </div>
      ) : tab === 'chat' && quote?.conversationId ? (
        <div className="max-h-[60vh] overflow-y-auto">
          <ConversationThread conversationId={quote.conversationId} />
        </div>
      ) : (
        <iframe
          title="Aperçu du devis (PDF)"
          src={pdfUrl ?? undefined}
          className="h-[60vh] w-full rounded-lg border border-slate-200 bg-slate-50"
        />
      )}
    </Modal>
  );
}
