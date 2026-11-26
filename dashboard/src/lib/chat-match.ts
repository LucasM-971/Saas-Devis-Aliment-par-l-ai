// Matching local de l'assistant, utilisé si l'API est indisponible.

export type QA = { id: string; question: string; answer: string };

// Message avec boutons : déclenché quand le client dit quelque chose de proche du trigger.
export type MessageBloc = {
  id: string;
  trigger: string; // mots-clés déclencheurs (ex. "je veux un devis")
  label?: string; // libellé lisible du bouton/chip présenté au prospect (ex. « Je veux un devis »)
  text: string; // message du bot
  buttons: string[]; // boutons à afficher (libellés libres)
};

// Origine de la réponse choisie — utilisée par le mode debug de l'aperçu.
export type MatchSource = 'greeting' | 'thanks' | 'price' | 'bloc' | 'qa' | 'fallback';

export type MatchResult = {
  answer: string;
  buttons: string[];
  source: MatchSource;
  score: number; // confiance 0..1 (1 pour les règles greeting/thanks/price)
  matchedId?: string; // id du bloc ou de la Q&R retenue
};

// Seuils de déclenchement (un bloc à boutons est plus spécifique → seuil plus haut).
export const BLOC_THRESHOLD = 0.15;
export const QA_THRESHOLD = 0.12;
// Bonus des blocs à boutons en cas d'égalité
export const BLOC_PRIORITY_MARGIN = 0.1;

const STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'en', 'et', 'est',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'que', 'qui',
  'quoi', 'comment', 'quand', 'quel', 'quelle', 'quels', 'quelles', 'pour',
  'sur', 'dans', 'avec', 'par', 'au', 'aux', 'ce', 'se', 'sa', 'son', 'ses',
  'pas', 'ne', 'plus', 'si', 'ou', 'mais', 'donc', 'ni', 'car', 'on', 'me',
  'te', 'lui', 'leur', 'leurs', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
  'vos', 'notre', 'votre', 'ont', 'sont', 'etre', 'avoir', 'cest', 'cela',
  'cette', 'ces', 'aussi', 'alors', 'bien', 'tout', 'tres', 'meme', 'non',
]);

// Synonymes métier vers une forme canonique
const SYNONYM_GROUPS: Record<string, string[]> = {
  prix: ['tarif', 'tarifs', 'cout', 'couts', 'coute', 'coutent', 'montant', 'montants', 'facture', 'factures', 'budget', 'euro', 'euros'],
  devis: ['estimation', 'estimations', 'chiffrage', 'chiffrages', 'estimer', 'estimatif'],
  delai: ['delais', 'temps', 'duree', 'durees', 'rapidite'],
  gratuit: ['gratuite', 'gratuits', 'offert', 'offerte', 'cadeau'],
  contact: ['contacter', 'joindre', 'appeler', 'telephone', 'telephoner', 'rdv', 'rendezvous', 'rappeler'],
  renovation: ['renover', 'refaire', 'reno', 'restaurer', 'restauration'],
  travaux: ['travail', 'chantier', 'chantiers', 'projet', 'projets', 'construction'],
};

const SYNONYM_MAP: Record<string, string> = {};
for (const [canonical, words] of Object.entries(SYNONYM_GROUPS)) {
  SYNONYM_MAP[canonical] = canonical;
  for (const w of words) SYNONYM_MAP[w] = canonical;
}

// Retire un pluriel simple (-s / -x) pour rapprocher singulier et pluriel.
function singularize(word: string): string {
  if (word.length > 3 && (word.endsWith('s') || word.endsWith('x'))) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => SYNONYM_MAP[w] ?? singularize(w));
}

// Similarité cosinus binaire (présence de tokens), insensible aux répétitions.
export function cosineSim(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / Math.sqrt(sa.size * sb.size);
}

export function shorten(s: string, max = 42): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Libellé du bloc, sinon ses mots-clés.
export function blocLabel(b: MessageBloc): string {
  return b.label?.trim() || shorten(b.trigger, 38);
}

// Tarif au m² d'une catégorie de travaux, éventuellement limité à une zone.
export type TarifM2 = { id: string; categorie: string; zone: string; prix: string };

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Réponse « prix » : tarifs de la catégorie / zone citée, sinon la grille complète.
function priceAnswer(lc: string, prixM2?: string, tarifs: TarifM2[] = []): string {
  const msg = norm(lc);
  const hits = tarifs.filter((t) => msg.includes(norm(t.categorie)) || (t.zone && msg.includes(norm(t.zone))));
  const list = hits.length ? hits : tarifs;
  const lines = list.map((t) => `- ${t.categorie}${t.zone ? ` (${t.zone})` : ''} : **${t.prix} €/m²**`);
  const head = prixM2 && !hits.length ? `Notre tarif de base est de **${prixM2} €/m²**.` : '';
  const body = lines.length ? `${head ? head + '\n\n' : ''}Nos tarifs au m² :\n${lines.join('\n')}` : head;
  return `${body}\n\nContactez-nous pour un devis personnalisé selon votre projet.`;
}

export function match(
  message: string,
  qas: QA[],
  blocs: MessageBloc[],
  prixM2?: string,
  tarifs: TarifM2[] = [],
): MatchResult {
  const lc = message.toLowerCase().trim();

  // Salutations
  if (/^(bonjour|salut|hello|bonsoir|coucou|hey|hi)\b/.test(lc)) {
    return {
      answer: 'Bonjour ! Je suis là pour vous aider à obtenir votre devis. Quelle est votre question ?',
      buttons: ['Obtenir un devis', 'Devis gratuit ?', 'Délai de réception'],
      source: 'greeting',
      score: 1,
    };
  }

  // Remerciements
  if (/\b(merci|super|parfait|nickel|ok merci|bonne journee)\b/.test(lc)) {
    return {
      answer: "Avec plaisir ! N'hésitez pas si vous avez d'autres questions sur votre devis.",
      buttons: ['Obtenir un devis', 'Modifier mon devis'],
      source: 'thanks',
      score: 1,
    };
  }

  // Prix au m²
  if ((prixM2 || tarifs.length) && /\b(prix|tarif|cout|coute|coûte|coût|combien|facture|m2|m²|metre|mètre|carre|carré)\b/.test(lc)) {
    return {
      answer: priceAnswer(lc, prixM2, tarifs),
      buttons: ['Obtenir un devis', 'Comment obtenir un devis ?'],
      source: 'price',
      score: 1,
    };
  }

  const tokens = tokenize(message);

  // Meilleur bloc à boutons et meilleure Q&R, évalués ensemble.
  const bestBloc = blocs.length
    ? blocs.map((b) => ({ b, score: cosineSim(tokens, tokenize(b.trigger)) })).sort((a, z) => z.score - a.score)[0]
    : undefined;

  const scoredQas = qas.length
    ? qas
        .map((qa) => ({
          qa,
          score: Math.max(
            cosineSim(tokens, tokenize(qa.question)),
            cosineSim(tokens, tokenize(qa.answer)) * 0.55,
          ),
        }))
        .sort((a, z) => z.score - a.score)
    : [];
  const bestQa = scoredQas[0];

  const blocOk = bestBloc !== undefined && bestBloc.score >= BLOC_THRESHOLD;
  const qaOk = bestQa !== undefined && bestQa.score >= QA_THRESHOLD;

  // 1. Bloc à boutons prioritaire — sauf si une Q&R est nettement plus pertinente.
  if (blocOk && (!qaOk || bestBloc.score + BLOC_PRIORITY_MARGIN >= bestQa.score)) {
    return { answer: bestBloc.b.text, buttons: bestBloc.b.buttons, source: 'bloc', score: bestBloc.score, matchedId: bestBloc.b.id };
  }

  // 2. Q&R standard
  if (qaOk) {
    const others = scoredQas.slice(1, 4).map((s) => shorten(s.qa.question));
    return { answer: bestQa.qa.answer, buttons: others, source: 'qa', score: bestQa.score, matchedId: bestQa.qa.id };
  }

  // 3. Aucune correspondance
  const fallbackButtons = [
    ...blocs.slice(0, 1).map((b) => blocLabel(b)),
    ...qas.slice(0, 2).map((q) => shorten(q.question)),
  ].slice(0, 3);

  return {
    answer: 'Je ne suis pas sûr de pouvoir répondre à cette question précise. Voici ce que je peux vous expliquer sur nos devis :',
    buttons: fallbackButtons,
    source: 'fallback',
    score: 0,
  };
}
