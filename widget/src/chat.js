/* Interface de conversation du widget (DOM vanilla, sans framework).
   Construit le fil de messages dans un conteneur fourni et pilote les échanges
   via le client API. Les styles sont injectés par embed.js dans le Shadow DOM. */

// Bornes alignées sur l'API publique : au-delà le serveur répond 422 — on
// tronque côté client pour qu'une conversation longue ne casse jamais l'échange.
const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY_ITEMS = 50;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function boundHistory(history) {
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LEN) }));
}

// Rendu minimal du gras **texte** (le bot n'émet pas de markdown complet).
function renderRichText(target, content) {
  const parts = String(content).split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      target.appendChild(el('strong', null, part.slice(2, -2)));
    } else if (part) {
      target.appendChild(document.createTextNode(part));
    }
  }
}

function formatEUR(n) {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  } catch {
    return n + ' €';
  }
}

// Premier message : accueil personnalisé + boutons de démarrage puisés dans la base.
function greeting(config) {
  const buttons = [];
  if (config.blocs && config.blocs[0]) buttons.push(config.blocs[0].label || config.blocs[0].trigger);
  for (const qa of config.qas || []) {
    if (buttons.length >= 3) break;
    buttons.push(qa.question);
  }
  const content =
    (config.greeting_message && config.greeting_message.trim()) ||
    "Bonjour ! Je suis l'assistant de " + config.company_name + '. Comment puis-je vous aider ?';
  return { content, buttons: buttons.length ? buttons : ['Obtenir un devis', 'Devis gratuit ?'] };
}

export function createChat(mount, { config, api }) {
  const history = []; // [{ role: 'user' | 'assistant', content }]
  let busy = false;
  let quoted = false;

  const thread = el('div', 'da-thread');
  const footer = el('div', 'da-footer');
  const composer = el('form', 'da-composer');
  const field = el('input', 'da-input');
  field.type = 'text';
  field.maxLength = MAX_MESSAGE_LEN;
  field.placeholder = 'Écrivez votre message…';
  const sendBtn = el('button', 'da-send');
  sendBtn.type = 'submit';
  sendBtn.setAttribute('aria-label', 'Envoyer');
  sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>';
  composer.appendChild(field);
  composer.appendChild(sendBtn);

  mount.appendChild(thread);
  mount.appendChild(footer);
  mount.appendChild(composer);

  function scrollToEnd() {
    thread.scrollTop = thread.scrollHeight;
  }

  function addUser(text) {
    const row = el('div', 'da-row da-row--user');
    const bubble = el('div', 'da-bubble da-bubble--user', text);
    row.appendChild(bubble);
    thread.appendChild(row);
    scrollToEnd();
  }

  function addBot(content, buttons) {
    const row = el('div', 'da-row da-row--bot');
    const bubble = el('div', 'da-bubble da-bubble--bot');
    renderRichText(bubble, content);
    row.appendChild(bubble);
    thread.appendChild(row);
    if (buttons && buttons.length) {
      const wrap = el('div', 'da-quick');
      for (const label of buttons) {
        const b = el('button', 'da-chip', label);
        b.type = 'button';
        b.addEventListener('click', () => send(label));
        wrap.appendChild(b);
      }
      thread.appendChild(wrap);
    }
    scrollToEnd();
  }

  function addQuote(quote) {
    const card = el('div', 'da-quote');
    const head = el('div', 'da-quote__head');
    head.appendChild(el('span', 'da-quote__ref', 'Devis ' + quote.reference));
    head.appendChild(el('span', 'da-quote__total', formatEUR(quote.total) + ' TTC'));
    card.appendChild(head);
    for (const line of quote.lines || []) {
      const li = el('div', 'da-quote__line');
      li.appendChild(el('span', 'da-quote__label', line.label + ' · ' + line.quantity + ' ' + line.unit));
      li.appendChild(el('span', 'da-quote__amount', formatEUR(line.line_total)));
      card.appendChild(li);
    }
    thread.appendChild(card);
    scrollToEnd();
  }

  function showTyping() {
    const row = el('div', 'da-row da-row--bot');
    const bubble = el('div', 'da-bubble da-bubble--bot da-typing');
    bubble.innerHTML = '<span></span><span></span><span></span>';
    row.appendChild(bubble);
    thread.appendChild(row);
    scrollToEnd();
    return row;
  }

  function setBusy(v) {
    busy = v;
    field.disabled = v;
    sendBtn.disabled = v;
  }

  function renderQuoteCta() {
    footer.innerHTML = '';
    if (quoted || !config.company_public_id || history.every((m) => m.role !== 'user')) return;
    const cta = el('button', 'da-cta', 'Générer mon devis estimatif');
    cta.type = 'button';
    cta.addEventListener('click', requestQuote);
    footer.appendChild(cta);
  }

  async function send(text) {
    const trimmed = String(text || '').trim().slice(0, MAX_MESSAGE_LEN);
    if (!trimmed || busy) return;
    field.value = '';
    addUser(trimmed);
    history.push({ role: 'user', content: trimmed });
    setBusy(true);
    const typing = showTyping();
    try {
      // La base de connaissances est lue en base côté serveur via le public_id.
      const res = await api.sendMessage({
        company_public_id: config.company_public_id,
        message: trimmed,
        history: boundHistory(history.slice(0, -1)),
      });
      typing.remove();
      addBot(res.answer, res.buttons);
      history.push({ role: 'assistant', content: res.answer });
    } catch {
      typing.remove();
      addBot('Merci ! Je transmets votre demande, un conseiller vous recontactera rapidement.');
    } finally {
      setBusy(false);
      renderQuoteCta();
    }
  }

  async function requestQuote() {
    if (busy || quoted || !config.company_public_id) return;
    setBusy(true);
    footer.innerHTML = '';
    const typing = showTyping();
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    try {
      const res = await api.requestQuote({
        company_public_id: config.company_public_id,
        message: String((lastUser && lastUser.content) || 'Je souhaite un devis.').slice(0, MAX_MESSAGE_LEN),
        history: boundHistory(history),
      });
      typing.remove();
      addBot(res.message);
      if (res.quote) addQuote(res.quote);
      quoted = res.outcome !== 'missing_info';
    } catch {
      typing.remove();
      addBot("Je n'ai pas pu générer le devis. Un conseiller vous recontactera.");
    } finally {
      setBusy(false);
    }
  }

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    send(field.value);
  });

  // Message d'accueil.
  const g = greeting(config);
  addBot(g.content, g.buttons);

  return {
    focus() {
      field.focus();
    },
  };
}
