import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeQuoteTotals } from './quote-math';
import { formatDate, formatPercent } from './format';
import { unitLabel } from './units';
import { DEFAULT_CANVAS_LAYOUT, withDefaultElements } from './canvas-layout';
import type { CanvasEl, Company, Quote, QuoteTemplate } from '@/types';

// Coordonnées de l'entreprise nécessaires au PDF (identité + mentions légales).
// On accepte un sous-ensemble de Company : seul le nom est requis.
export type PdfCompany = Partial<Company> & { name: string };

function eur(value: number): string {
  return `${value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [isNaN(r) ? 79 : r, isNaN(g) ? 70 : g, isNaN(b) ? 229 : b];
}

const DEFAULT_TEMPLATE: QuoteTemplate = {
  accentColor: '#4f46e5',
  logoDataUrl: null,
  logoPosition: 'left',
  showReference: true,
  showDate: true,
  showClientEmail: true,
  showCompanyDetails: true,
  showLegal: true,
  footerText: "Devis valable 30 jours à compter de sa date d'émission.",
  backgroundImageUrl: null,
};

// Format A4 en points (unité du document).
const A4 = { w: 595.28, h: 841.89 };

function getEl(layout: CanvasEl[], type: CanvasEl['type']): CanvasEl | null {
  return layout.find((e) => e.type === type && e.visible) ?? null;
}

// Identité légale de l'émetteur affichée en en-tête (une entrée par ligne
// renseignée : forme juridique, adresse, SIRET/APE, RCS/RM, TVA, contact).
export function companyIdentityLines(c: PdfCompany): string[] {
  const lines: string[] = [];

  const statut = [c.legalForm, c.shareCapital && `au capital de ${c.shareCapital}`]
    .filter(Boolean)
    .join(' ');
  if (statut) lines.push(statut);

  if (c.address) lines.push(c.address);

  const ident = [c.siret && `SIRET ${c.siret}`, c.apeCode && `APE ${c.apeCode}`]
    .filter(Boolean)
    .join(' · ');
  if (ident) lines.push(ident);

  if (c.rcsRm) lines.push(c.rcsRm);
  if (c.vatNumber) lines.push(`N° TVA ${c.vatNumber}`);

  const contact = [c.contactPhone && `Tél. ${c.contactPhone}`, c.contactEmail]
    .filter(Boolean)
    .join(' · ');
  if (contact) lines.push(contact);

  return lines;
}

// Mentions légales obligatoires d'un devis BTP (assurance décennale, franchise
// de TVA, information de médiation, engagement de signature).
export function legalMentions(c: PdfCompany): string[] {
  const mentions: string[] = [];

  if (c.vatExempt) mentions.push('TVA non applicable, art. 293 B du CGI.');

  if (c.insuranceName) {
    // Séparateur « · » (et non tiret cadratin) : la police PDF n'a pas le glyphe —.
    const detail = [c.insuranceContract && `contrat ${c.insuranceContract}`, c.insuranceCoverage]
      .filter(Boolean)
      .join(' · ');
    mentions.push(`Assurance décennale : ${c.insuranceName}${detail ? ` (${detail})` : ''}.`);
  }

  // Apostrophe droite (') : la police PDF standard ne rend pas l'apostrophe typographique.
  mentions.push(
    "Devis reçu avant l'exécution des travaux, à retourner daté et signé avec la mention « Bon pour accord ».",
  );

  if (c.mediatorName) {
    mentions.push(
      `Médiation de la consommation : en cas de litige, recours gratuit au médiateur ${c.mediatorName}${c.mediatorUrl ? ` (${c.mediatorUrl})` : ''}.`,
    );
  }

  return mentions;
}

export function buildQuotePdf(
  quote: Quote,
  company: PdfCompany | string,
  tpl: QuoteTemplate = DEFAULT_TEMPLATE,
): jsPDF {
  // Rétro-compatibilité : certains appels historiques passaient le seul nom.
  const comp: PdfCompany = typeof company === 'string' ? { name: company } : company;
  const companyName = comp.name || 'Mon entreprise';

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const totals = computeQuoteTotals(quote);
  const accent = hexToRgb(tpl.accentColor);
  const layout = withDefaultElements(tpl.canvasLayout ?? DEFAULT_CANVAS_LAYOUT);

  // ── Design importé : image de fond couvrant toute la page A4 ───────────────
  if (tpl.backgroundImageUrl) {
    try {
      doc.addImage(tpl.backgroundImageUrl, 0, 0, A4.w, A4.h);
    } catch { /* image invalide : on continue sans fond */ }
  }

  // ── Formes et images libres (sous le contenu, dans l'ordre des calques) ───
  for (const el of layout) {
    if (!el.visible) continue;
    if (!['shape_rect', 'shape_ellipse', 'shape_line', 'image'].includes(el.type)) continue;
    withOpacity(doc, el.opacity, () => drawDecor(doc, el));
  }

  // ── Logo (maintien du ratio) ──────────────────────────────────────────────
  const logoEl = getEl(layout, 'logo');
  if (logoEl && tpl.logoDataUrl) {
    try {
      const props = doc.getImageProperties(tpl.logoDataUrl);
      const aspect = props.width / props.height;
      let imgW = logoEl.w;
      let imgH = imgW / aspect;
      if (imgH > logoEl.h) { imgH = logoEl.h; imgW = imgH * aspect; }
      const imgX = logoEl.x + (logoEl.w - imgW) / 2;
      const imgY = logoEl.y + (logoEl.h - imgH) / 2;
      doc.addImage(tpl.logoDataUrl, imgX, imgY, imgW, imgH);
    } catch { /* image invalide */ }
  }

  // ── Nom entreprise ────────────────────────────────────────────────────────
  const compEl = getEl(layout, 'company_name');
  if (compEl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text(companyName, compEl.x, compEl.y + compEl.h * 0.8);
  }

  // ── Coordonnées légales de l'émetteur (SIRET, forme juridique, TVA…) ───────
  const detailsEl = getEl(layout, 'company_details');
  if (detailsEl && tpl.showCompanyDetails) {
    const identity = companyIdentityLines(comp);
    if (identity.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      let dy = detailsEl.y + 9;
      for (const l of identity) {
        doc.text(l, detailsEl.x, dy, { maxWidth: detailsEl.w });
        dy += 10;
      }
    }
  }

  // ── Titre DEVIS ───────────────────────────────────────────────────────────
  const labelEl = getEl(layout, 'quote_label');
  if (labelEl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...accent);
    doc.text('DEVIS', labelEl.x + labelEl.w, labelEl.y + labelEl.h * 0.8, { align: 'right' });
  }

  // ── Référence / Date ──────────────────────────────────────────────────────
  const metaEl = getEl(layout, 'meta_block');
  if (metaEl) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    let my = metaEl.y + 13;
    if (tpl.showReference) {
      doc.text(`Référence : ${quote.reference}`, metaEl.x + metaEl.w, my, { align: 'right' });
      my += 13;
    }
    if (tpl.showDate) {
      doc.text(`Date : ${formatDate(quote.createdAt)}`, metaEl.x + metaEl.w, my, { align: 'right' });
    }
  }

  // ── Bloc client ───────────────────────────────────────────────────────────
  const clientEl = getEl(layout, 'client_block');
  if (clientEl) {
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ADRESSÉ À', clientEl.x, clientEl.y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(quote.clientName, clientEl.x, clientEl.y + 26);
    if (tpl.showClientEmail && quote.clientEmail) {
      doc.setTextColor(110);
      doc.text(quote.clientEmail, clientEl.x, clientEl.y + 39);
    }
  }

  // ── Tableau des postes ────────────────────────────────────────────────────
  const tableEl = getEl(layout, 'table');
  const startY = tableEl?.y ?? 196;
  const marginLeft = tableEl?.x ?? 40;

  autoTable(doc, {
    startY,
    head: [['Désignation', 'Qté', 'Unité', 'PU HT', 'Total HT']],
    body: quote.lines.map((line) => [
      line.label,
      String(line.quantity),
      unitLabel(line.unit),
      eur(line.unitPrice),
      eur(line.quantity * line.unitPrice),
    ]),
    headStyles: { fillColor: accent, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 44 },
      2: { halign: 'center', cellWidth: 52 },
      3: { halign: 'right', cellWidth: 78 },
      4: { halign: 'right', cellWidth: 78 },
    },
    margin: { left: marginLeft, right: 40 },
  });

  // ── Totaux (HT, remise éventuelle, TVA, TTC) ──────────────────────────────
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const totalsEl = getEl(layout, 'totals_block');
  const ty = Math.max(totalsEl?.y ?? 0, finalY + 20);
  const tx = totalsEl?.x ?? 370;
  const tRight = totalsEl ? totalsEl.x + totalsEl.w : 555;

  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.setFont('helvetica', 'normal');
  let line = ty;
  doc.text('Total HT', tx, line);
  doc.text(eur(totals.subtotal), tRight, line, { align: 'right' });
  if (totals.discount > 0) {
    line += 14;
    const label =
      quote.discountType === 'percent'
        ? `Remise (${quote.discountValue ?? 0} %)`
        : 'Remise';
    doc.text(label, tx, line);
    doc.text(`−${eur(totals.discount)}`, tRight, line, { align: 'right' });
    line += 14;
    doc.text('HT après remise', tx, line);
    doc.text(eur(totals.netSubtotal), tRight, line, { align: 'right' });
  }
  line += 14;
  if (comp.vatExempt) {
    // Franchise en base : pas de TVA, mention réglementaire à la place.
    doc.text('TVA non applicable (art. 293 B du CGI)', tx, line);
  } else {
    doc.text(`TVA (${formatPercent(quote.vatRate)})`, tx, line);
    doc.text(eur(totals.vat), tRight, line, { align: 'right' });
  }

  doc.setDrawColor(...accent);
  doc.setLineWidth(0.5);
  doc.line(tx, line + 6, tRight, line + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...accent);
  doc.text(comp.vatExempt ? 'Total' : 'Total TTC', tx, line + 20);
  doc.text(eur(totals.total), tRight, line + 20, { align: 'right' });

  // ── Conditions / mentions du devis ────────────────────────────────────────
  const condEl = getEl(layout, 'conditions');
  if (condEl && quote.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.text('CONDITIONS', condEl.x, condEl.y + 11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90);
    doc.text(quote.notes, condEl.x, condEl.y + 25, { maxWidth: condEl.w });
  }

  // ── Cadre signature (« Bon pour accord ») ─────────────────────────────────
  const signEl = getEl(layout, 'signature');
  if (signEl) {
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.roundedRect(signEl.x, signEl.y, signEl.w, signEl.h, 3, 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text('BON POUR ACCORD', signEl.x + 8, signEl.y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140);
    doc.text('Date et signature du client', signEl.x + 8, signEl.y + 26);
  }

  // ── Mentions légales obligatoires (assurance, TVA, médiation) ──────────────
  const legalEl = getEl(layout, 'legal_block');
  if (legalEl && tpl.showLegal) {
    const mentions = legalMentions(comp);
    if (mentions.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text('MENTIONS LÉGALES', legalEl.x, legalEl.y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(140);
      // Mentions séparées par « · », repliées sur la largeur du bloc.
      const wrapped = doc.splitTextToSize(mentions.join('  ·  '), legalEl.w) as string[];
      doc.text(wrapped, legalEl.x, legalEl.y + 17);
    }
  }

  // ── Textes libres personnalisés ───────────────────────────────────────────
  const customEls = layout.filter((e) => e.type === 'custom_text' && e.visible);
  for (const el of customEls) {
    withOpacity(doc, el.opacity, () => {
      const style = el.bold && el.italic ? 'bolditalic' : el.bold ? 'bold' : el.italic ? 'italic' : 'normal';
      doc.setFont('helvetica', style);
      const size = el.fontSize ?? 10;
      doc.setFontSize(size);
      const [r, g, b] = hexToRgb(el.color ?? '#111111');
      doc.setTextColor(r, g, b);
      const textX =
        el.align === 'right' ? el.x + el.w : el.align === 'center' ? el.x + el.w / 2 : el.x;
      const lines = doc.splitTextToSize(el.content ?? '', el.w) as string[];
      const lh = size * 1.2;
      lines.forEach((line, i) => {
        const y = el.y + size * 0.95 + i * lh;
        doc.text(line, textX, y, { align: el.align ?? 'left' });
        if (el.underline) {
          const lw = doc.getTextWidth(line);
          const lx = el.align === 'right' ? textX - lw : el.align === 'center' ? textX - lw / 2 : textX;
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(Math.max(0.4, size / 16));
          doc.line(lx, y + size * 0.12, lx + lw, y + size * 0.12);
        }
      });
    });
  }

  // ── Pied de page ─────────────────────────────────────────────────────────
  const footerEl = getEl(layout, 'footer_text');
  const footerY = footerEl?.y ?? 810;
  const footerX = footerEl?.x ?? 40;
  const footerRight = footerEl ? footerEl.x + footerEl.w : 555;

  if (tpl.footerText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(tpl.footerText, footerX, footerY);
  }
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(companyName, footerRight, footerY, { align: 'right' });

  return doc;
}


function withOpacity(doc: jsPDF, opacity: number | undefined, draw: () => void) {
  const o = opacity ?? 1;
  if (o >= 1) { draw(); return; }
  try {
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (o: object) => unknown }).GState({ opacity: o, 'stroke-opacity': o }) as never);
    draw();
    doc.restoreGraphicsState();
  } catch { draw(); }
}

function drawDecor(doc: jsPDF, el: CanvasEl) {
  if (el.type === 'image') {
    if (el.src) { try { doc.addImage(el.src, el.x, el.y, el.w, el.h); } catch { /* image invalide */ } }
    return;
  }
  const sw = el.strokeWidth ?? 0;
  const hasFill = !!el.fill;
  const hasStroke = !!el.stroke && sw > 0;
  if (hasFill) { const [r, g, b] = hexToRgb(el.fill!); doc.setFillColor(r, g, b); }
  if (hasStroke) { const [r, g, b] = hexToRgb(el.stroke!); doc.setDrawColor(r, g, b); doc.setLineWidth(sw); }
  if (el.type === 'shape_line') {
    const [r, g, b] = hexToRgb(el.stroke || el.fill || '#111111');
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(Math.max(0.5, sw || el.h));
    doc.line(el.x, el.y + el.h / 2, el.x + el.w, el.y + el.h / 2);
    return;
  }
  const style = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : hasStroke ? 'S' : null;
  if (!style) return;
  if (el.type === 'shape_ellipse') {
    doc.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, style);
  } else if (el.radius) {
    const r = Math.min(el.radius, el.w / 2, el.h / 2);
    doc.roundedRect(el.x, el.y, el.w, el.h, r, r, style);
  } else {
    doc.rect(el.x, el.y, el.w, el.h, style);
  }
}
