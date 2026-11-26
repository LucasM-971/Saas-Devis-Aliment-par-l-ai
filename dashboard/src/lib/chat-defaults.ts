// Modèle de départ de la base de connaissances : proposé lors de la première
// configuration de l'assistant (page Chat AI), jamais affiché aux prospects
// tant qu'il n'a pas été publié explicitement.

import type { MessageBloc, QA } from '@/lib/chat-match';

export const DEFAULT_QAS: QA[] = [
  { id: '1', question: 'Comment obtenir un devis ?', answer: 'Rien de plus simple : remplissez notre formulaire en ligne en quelques minutes. Nous vous envoyons un devis personnalisé sous 24 h.' },
  { id: '2', question: 'Le devis est-il gratuit ?', answer: 'Oui, l\'établissement de votre devis est entièrement gratuit et sans engagement de votre part.' },
  { id: '3', question: 'Dans quel délai je reçois mon devis ?', answer: 'Vous recevez votre devis par e-mail sous 24 à 48 heures ouvrées après avoir rempli le formulaire.' },
  { id: '4', question: 'Quelles informations faut-il fournir ?', answer: 'Nous avons besoin de la nature des travaux ou services souhaités, de la superficie ou quantité estimée, et de vos coordonnées.' },
  { id: '5', question: 'Puis-je modifier mon devis ?', answer: 'Oui, tout à fait. Après réception, vous pouvez nous demander des ajustements et nous vous renverrons un devis mis à jour.' },
  { id: '6', question: 'Combien de temps le devis est-il valable ?', answer: 'Nos devis sont valables 30 jours à compter de la date d\'émission.' },
];

export const DEFAULT_BLOCS: MessageBloc[] = [
  {
    id: 'b1',
    trigger: 'je veux un devis commencer démarrer',
    label: 'Je veux un devis',
    text: 'Super ! Pour établir votre devis, j\'ai besoin de quelques informations. Quel type de projet avez-vous ?',
    buttons: ['Travaux neufs', 'Rénovation', 'Autre projet'],
  },
];
