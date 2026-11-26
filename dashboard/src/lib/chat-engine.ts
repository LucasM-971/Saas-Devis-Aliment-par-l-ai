// Cœur de conversation partagé entre l'aperçu du dashboard et la page de chat
// hébergée (/c/:publicId). Encapsule l'appel à l'API.
//
// Deux modes, deux politiques d'échec :
// - Page hébergée (companyPublicId) : le serveur persiste chaque tour et porte
//   les métriques pilote — AUCUN repli local silencieux. Un échec API est
//   montré au prospect avec un bouton « réessayer » (failedText / retry).
// - Aperçu du dashboard (pas de public_id) : outil de debug de la base de
//   connaissances — le matching local reste un secours acceptable.

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { blocLabel, match, shorten, type MatchResult, type MatchSource, type MessageBloc, type QA, type TarifM2 } from '@/lib/chat-match';

export type QuoteLineResult = {
  label: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type QuoteResult = {
  reference: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  lines: QuoteLineResult[];
};

export type ChatMsg = {
  id: string;
  role: 'bot' | 'user';
  content: string;
  buttons?: string[];
  loading?: boolean;
  source?: MatchSource; // origine de la réponse (mode debug)
  score?: number; // confiance 0..1 (mode debug)
  via?: 'api' | 'local'; // réponse de l'IA ou du matching local
  quote?: QuoteResult; // devis chiffré rattaché (bulle spéciale)
};

export type ChatConfig = {
  companyName: string;
  qas: QA[];
  blocs: MessageBloc[];
  prixM2?: string;
  tarifs?: TarifM2[]; // tarifs au m² par catégorie / zone
  greeting?: string | null; // message d'accueil personnalisé (sinon message par défaut)
  companyPublicId?: string; // requis pour générer un devis
};

// Bornes alignées sur l'API publique (backend, llm/schemas.py) : au-delà le
// serveur répond 422 — on tronque côté client pour qu'une conversation longue
// ou un long collage ne fasse jamais échouer l'échange.
export const MAX_MESSAGE_LEN = 2000;
export const MAX_HISTORY_ITEMS = 60;

// Boutons de fin de conversation proposés par l'IA (alignés sur backend/app/llm/prompts.py).
export const QUOTE_BUTTON = 'Faire la demande de devis';
export const INFO_BUTTON = 'Plus de renseignements';

// Tolère les petites variations d'un modèle (casse, ponctuation, « Faire ma demande… »).
export function isQuoteButton(label: string): boolean {
  const norm = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return norm.includes('demande de devis');
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Premier message du bot : accueil + boutons de démarrage puisés dans la base.
export function botGreeting(cfg: ChatConfig): ChatMsg {
  const firstButtons = [
    ...cfg.blocs.slice(0, 1).map((b) => blocLabel(b)),
    ...cfg.qas.slice(0, 2).map((q) => shorten(q.question)),
  ].slice(0, 3);
  const content =
    cfg.greeting?.trim() ||
    `Bonjour ! Je suis l'assistant de **${cfg.companyName}**. Je suis là pour répondre à vos questions et vous aider à obtenir votre devis. Par où voulez-vous commencer ?`;
  return {
    id: uid(),
    role: 'bot',
    content,
    buttons: firstButtons.length > 0 ? firstButtons : ['Obtenir un devis', 'Devis gratuit ?'],
  };
}

// Questions de démarrage proposées sous le chat (puise dans la base configurée).
export function starterSuggestions(qas: QA[], blocs: MessageBloc[], prixM2?: string, tarifs: TarifM2[] = []): string[] {
  const out: string[] = [];
  if (blocs[0]) out.push(blocLabel(blocs[0]));
  if (prixM2 || tarifs.length) out.push('Quel est votre tarif au m² ?');
  for (const qa of qas) {
    if (out.length >= 4) break;
    out.push(shorten(qa.question));
  }
  return out.slice(0, 4);
}

type MessageApiResponse = {
  answer: string;
  buttons: string[];
  session_uid?: string | null;
};

type QuoteApiResponse = {
  outcome: 'quote' | 'lead' | 'missing_info';
  quote?: QuoteResult;
  missing_fields?: string[];
  lead_reason?: string | null;
  message: string;
};

// État + logique de conversation, réutilisables par plusieurs interfaces.
export function useChatConversation(cfg: ChatConfig) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => [botGreeting(cfg)]);
  const [busy, setBusy] = useState(false);
  // Identifiant de session généré CÔTÉ CLIENT dès le départ : si le tout
  // premier envoi échoue, le réessai porte le même uid — le serveur déduplique
  // au lieu de créer une conversation fantôme. Le serveur peut renvoyer le
  // sien (ancien contrat) : on l'adopte alors.
  const [sessionUid, setSessionUid] = useState<string>(() => crypto.randomUUID());
  // Dernier message dont l'envoi a échoué (page hébergée) : proposé au réessai.
  const [failedText, setFailedText] = useState<string | null>(null);

  const reset = useCallback(() => {
    setMessages([botGreeting(cfg)]);
    setSessionUid(crypto.randomUUID());
    setFailedText(null);
  }, [cfg]);

  const send = useCallback(
    async (text: string, opts?: { isRetry?: boolean }) => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE_LEN);
      if (!trimmed || busy) return;
      setBusy(true);
      setFailedText(null);

      const loadingId = uid();

      // Historique capturé avant d'ajouter le nouveau message. Au réessai, le
      // message utilisateur est déjà affiché : on l'écarte de l'historique
      // (il repart comme message courant) et on ne le ré-affiche pas. Borné aux
      // limites de l'API : une conversation longue ne doit jamais finir en 422.
      let historyMsgs = messages.filter((m) => !m.loading);
      if (opts?.isRetry) {
        const last = historyMsgs[historyMsgs.length - 1];
        if (last?.role === 'user' && last.content === trimmed) {
          historyMsgs = historyMsgs.slice(0, -1);
        }
      }
      const historyForApi = historyMsgs
        .slice(-MAX_HISTORY_ITEMS)
        .map((m) => ({
          role: m.role === 'bot' ? ('assistant' as const) : ('user' as const),
          content: m.content.slice(0, MAX_MESSAGE_LEN),
        }));

      const userMsg: ChatMsg = { id: uid(), role: 'user', content: trimmed };
      setMessages((p) => [
        ...(opts?.isRetry ? p : [...p, userMsg]),
        { id: loadingId, role: 'bot', content: '', loading: true },
      ]);

      // Le matching local sert de référence (debug) et de secours en APERÇU.
      const local: MatchResult = match(trimmed, cfg.qas, cfg.blocs, cfg.prixM2 || undefined, cfg.tarifs);
      let reply: ChatMsg;

      try {
        // Page hébergée : endpoint public, la KB est lue en base via le public_id.
        // Aperçu du dashboard (pas de public_id) : endpoint authentifié qui teste
        // la KB non sauvegardée transportée dans le corps.
        if (cfg.companyPublicId) {
          const result = await api.post<MessageApiResponse>('/api/v1/chat/message', {
            company_public_id: cfg.companyPublicId,
            message: trimmed,
            history: historyForApi,
            session_uid: sessionUid,
          });
          if (result.session_uid && result.session_uid !== sessionUid) {
            setSessionUid(result.session_uid);
          }
          reply = { id: loadingId, role: 'bot', content: result.answer, buttons: result.buttons, via: 'api', source: local.source };
        } else {
          const result = await api.post<MessageApiResponse>('/api/v1/widget/preview/message', {
            message: trimmed,
            qas: cfg.qas.map(({ question, answer }) => ({ question, answer })),
            blocs: cfg.blocs.map(({ trigger, text: t, buttons: b }) => ({ trigger, text: t, buttons: b })),
            history: historyForApi,
            prix_m2: cfg.prixM2 || undefined,
            tarifs_m2: (cfg.tarifs ?? []).map(({ categorie, zone, prix }) => ({ categorie, zone, prix })),
          });
          reply = { id: loadingId, role: 'bot', content: result.answer, buttons: result.buttons, via: 'api', source: local.source };
        }
      } catch {
        if (cfg.companyPublicId) {
          // Page hébergée : échec VISIBLE. Un repli local silencieux créerait
          // des conversations fantômes invisibles du serveur (métriques mortes).
          setMessages((p) => p.filter((m) => m.id !== loadingId));
          setFailedText(trimmed);
          setBusy(false);
          return;
        }
        // Aperçu : repli local (outil de debug, rien à mesurer).
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
        reply = { id: loadingId, role: 'bot', content: local.answer, buttons: local.buttons, via: 'local', source: local.source, score: local.score };
      }

      setMessages((p) => p.map((m) => (m.id === loadingId ? reply : m)));
      setBusy(false);
    },
    [busy, messages, cfg, sessionUid],
  );

  // Relance le dernier message en échec (le serveur déduplique le tour).
  const retry = useCallback(() => {
    if (!failedText) return;
    void send(failedText, { isRetry: true });
  }, [failedText, send]);

  // Génère un devis chiffré à partir de la conversation (endpoint public /chat/quote).
  // `label` : texte du bouton cliqué, affiché comme message du prospect.
  const requestQuote = useCallback(async (label?: string) => {
    if (busy || !cfg.companyPublicId) return;
    setBusy(true);
    const loadingId = uid();
    if (label) setMessages((p) => [...p, { id: uid(), role: 'user', content: label }]);

    const history = messages
      .filter((m) => !m.loading)
      .slice(-MAX_HISTORY_ITEMS)
      .map((m) => ({ role: m.role === 'bot' ? ('assistant' as const) : ('user' as const), content: m.content.slice(0, MAX_MESSAGE_LEN) }));
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');

    setMessages((p) => [...p, { id: loadingId, role: 'bot', content: '', loading: true }]);

    let reply: ChatMsg;
    let sent = false;
    try {
      const res = await api.post<QuoteApiResponse>('/api/v1/chat/quote', {
        company_public_id: cfg.companyPublicId,
        message: (lastUser?.content ?? 'Je souhaite un devis.').slice(0, MAX_MESSAGE_LEN),
        history,
        session_uid: sessionUid,
      });
      reply = { id: loadingId, role: 'bot', content: res.message, quote: res.quote };
      sent = res.outcome !== 'missing_info';
    } catch {
      reply = {
        id: loadingId,
        role: 'bot',
        content: "Je n'ai pas pu générer le devis pour le moment. Vous pouvez réessayer dans un instant.",
      };
    }

    // Après l'envoi, l'assistant demande si le prospect a besoin d'autre chose.
    const followUp: ChatMsg[] = sent
      ? [{
          id: uid(),
          role: 'bot',
          content: `Votre demande a bien été transmise à l'équipe de **${cfg.companyName}**, qui la vérifiera avant de vous recontacter. Avez-vous besoin de plus de renseignements ?`,
          buttons: ["Oui, j'ai une question", 'Non, merci'],
        }]
      : [];
    setMessages((p) => [...p.map((m) => (m.id === loadingId ? reply : m)), ...followUp]);
    setBusy(false);
  }, [busy, messages, cfg.companyPublicId, cfg.companyName, sessionUid]);

  return {
    messages,
    busy,
    send,
    reset,
    requestQuote,
    canQuote: Boolean(cfg.companyPublicId),
    // Échec d'envoi visible (page hébergée uniquement) + relance.
    failedText,
    retry,
  };
}
