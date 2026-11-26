/* Client HTTP du widget Devis AI : configuration publique, messages, devis.
   Aucun état, aucune dépendance — juste des appels fetch vers l'API. */

export function createApi(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');

  async function postJSON(path, body) {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  return {
    // Configuration publique de l'entreprise (apparence + base de connaissances).
    async getConfig(publicId) {
      const res = await fetch(base + '/api/v1/chat/config/' + encodeURIComponent(publicId));
      if (!res.ok) throw new Error('config HTTP ' + res.status);
      return res.json();
    },
    // Réponse conversationnelle du bot.
    sendMessage(payload) {
      return postJSON('/api/v1/chat/message', payload);
    },
    // Transforme la conversation en devis chiffré (ou en lead).
    requestQuote(payload) {
      return postJSON('/api/v1/chat/quote', payload);
    },
  };
}
