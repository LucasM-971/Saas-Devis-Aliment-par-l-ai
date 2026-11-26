/**
 * Widget embarquable.
 *
 * <script type="module" src="https://cdn.devis-ai.fr/widget.js"
 *         data-company="VOTRE_PUBLIC_ID"></script>
 *
 * Options : data-api, data-color, data-position="left". Rendu dans un Shadow DOM.
 */

import { createApi } from './api.js';
import { createChat } from './chat.js';

// Base de démonstration (data-company="demo") — permet d'essayer sans backend.
const DEMO_CONFIG = {
  company_public_id: 'demo',
  company_name: 'Atelier Dupont',
  primary_color: '#2563EB',
  greeting_message: "Bonjour ! Je suis l'assistant de l'Atelier Dupont. Comment puis-je vous aider ?",
  qas: [
    { question: 'Le devis est-il gratuit ?', answer: 'Oui, totalement gratuit et sans engagement.' },
    { question: 'Dans quel délai ?', answer: 'Vous recevez votre devis sous 24 à 48 h.' },
  ],
  blocs: [
    { trigger: 'je veux un devis', label: 'Je veux un devis', text: 'Super ! Quel type de projet ?', buttons: ['Travaux neufs', 'Rénovation'] },
  ],
  prix_m2: null,
};

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .da-launcher {
    position: fixed; bottom: 20px; z-index: 2147483000;
    width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer;
    background: var(--da-accent); color: #fff;
    display: grid; place-items: center;
    box-shadow: 0 8px 24px rgba(0,0,0,.22); transition: transform .15s ease;
  }
  .da-launcher:hover { transform: scale(1.06); }
  .da-launcher--right { right: 20px; }
  .da-launcher--left { left: 20px; }
  .da-panel {
    position: fixed; bottom: 92px; z-index: 2147483000;
    width: 380px; max-width: calc(100vw - 32px); height: 560px; max-height: calc(100vh - 120px);
    display: none; flex-direction: column; overflow: hidden;
    background: #fff; border-radius: 16px; border: 1px solid #e2e8f0;
    box-shadow: 0 24px 48px rgba(0,0,0,.24);
  }
  .da-panel--right { right: 20px; }
  .da-panel--left { left: 20px; }
  .da-panel.is-open { display: flex; }
  .da-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; background: var(--da-accent); color: #fff;
  }
  .da-header__id { display: flex; align-items: center; gap: 10px; }
  .da-avatar { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.2); display: grid; place-items: center; }
  .da-header__name { font-size: 14px; font-weight: 600; line-height: 1.1; }
  .da-header__sub { font-size: 11px; opacity: .8; margin-top: 2px; }
  .da-close { background: none; border: none; color: rgba(255,255,255,.8); cursor: pointer; padding: 4px; border-radius: 6px; }
  .da-close:hover { background: rgba(255,255,255,.15); color: #fff; }
  .da-thread { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; }
  .da-row { display: flex; }
  .da-row--user { justify-content: flex-end; }
  .da-row--bot { justify-content: flex-start; }
  .da-bubble { max-width: 82%; padding: 9px 13px; border-radius: 16px; font-size: 14px; line-height: 1.45; }
  .da-bubble--bot { background: #fff; border: 1px solid #e2e8f0; color: #1e293b; border-bottom-left-radius: 4px; }
  .da-bubble--user { background: var(--da-accent); color: #fff; border-bottom-right-radius: 4px; }
  .da-quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .da-chip {
    border: 1px solid var(--da-border); background: #fff; color: var(--da-accent);
    border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 500; cursor: pointer;
  }
  .da-chip:hover { background: var(--da-soft); }
  .da-typing { display: inline-flex; gap: 4px; align-items: center; }
  .da-typing span { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: da-bounce 1s infinite; }
  .da-typing span:nth-child(2) { animation-delay: .15s; }
  .da-typing span:nth-child(3) { animation-delay: .3s; }
  @keyframes da-bounce { 0%,60%,100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
  .da-quote { background: #fff; border: 1px solid var(--da-border); border-radius: 12px; overflow: hidden; }
  .da-quote__head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--da-soft); }
  .da-quote__ref { font-size: 12px; font-weight: 600; color: var(--da-accent); }
  .da-quote__total { font-size: 14px; font-weight: 700; color: #0f172a; }
  .da-quote__line { display: flex; justify-content: space-between; gap: 10px; padding: 7px 12px; font-size: 12px; border-top: 1px solid #f1f5f9; }
  .da-quote__label { color: #475569; }
  .da-quote__amount { color: #0f172a; font-weight: 600; white-space: nowrap; }
  .da-footer:empty { display: none; }
  .da-footer { padding: 8px 12px 0; }
  .da-cta { width: 100%; border: none; border-radius: 999px; padding: 10px; font-size: 14px; font-weight: 600; color: #fff; background: var(--da-accent); cursor: pointer; }
  .da-cta:hover { opacity: .92; }
  .da-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e2e8f0; }
  .da-input { flex: 1; border: 1px solid #cbd5e1; border-radius: 999px; padding: 9px 14px; font-size: 14px; outline: none; }
  .da-input:focus { border-color: var(--da-accent); box-shadow: 0 0 0 3px var(--da-soft); }
  .da-send { width: 38px; height: 38px; flex: none; border: none; border-radius: 50%; background: var(--da-accent); color: #fff; cursor: pointer; display: grid; place-items: center; }
  .da-send:disabled, .da-input:disabled { opacity: .55; }
  .da-powered { text-align: center; font-size: 10px; color: #94a3b8; padding: 6px; background: #f8fafc; }
`;

const ICON_CHAT = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';
const ICON_BOT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01M16 16h.01"/></svg>';

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function locateScript() {
  return document.currentScript || document.querySelector('script[data-company]');
}

function boot() {
  const script = locateScript();
  if (!script) return;
  const publicId = script.getAttribute('data-company');
  if (!publicId) return;
  const apiBase = script.getAttribute('data-api') || 'https://api.devis-ai.fr';
  const colorOverride = script.getAttribute('data-color');
  const side = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  const api = createApi(apiBase);

  const configPromise =
    publicId === 'demo' ? Promise.resolve(DEMO_CONFIG) : api.getConfig(publicId);

  configPromise
    .then((config) => mountWidget({ config, api, colorOverride, side }))
    .catch(() => {
      /* Config indisponible (lien invalide, API KO) : on n'affiche rien. */
    });
}

function mountWidget({ config, api, colorOverride, side }) {
  const accent = colorOverride || config.primary_color || '#2563EB';

  const host = document.createElement('div');
  host.id = 'devis-ai-widget-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const root = el('div', 'da-root');
  root.style.setProperty('--da-accent', accent);
  root.style.setProperty('--da-soft', `color-mix(in srgb, ${accent} 12%, white)`);
  root.style.setProperty('--da-border', `color-mix(in srgb, ${accent} 35%, white)`);
  shadow.appendChild(root);

  const launcher = el('button', 'da-launcher da-launcher--' + side, ICON_CHAT);
  launcher.setAttribute('aria-label', 'Ouvrir le chat');

  const panel = el('div', 'da-panel da-panel--' + side);
  const header = el('div', 'da-header');
  const idBlock = el('div', 'da-header__id');
  idBlock.appendChild(el('div', 'da-avatar', ICON_BOT));
  const nameBlock = el('div');
  // textContent pour éviter l'injection HTML
  const nameEl = el('div', 'da-header__name');
  nameEl.textContent = config.company_name || '';
  nameBlock.appendChild(nameEl);
  nameBlock.appendChild(el('div', 'da-header__sub', 'Assistant · répond instantanément'));
  idBlock.appendChild(nameBlock);
  const closeBtn = el('button', 'da-close', ICON_CLOSE);
  closeBtn.setAttribute('aria-label', 'Fermer');
  header.appendChild(idBlock);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = el('div', 'da-body');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.flex = '1';
  body.style.minHeight = '0';
  panel.appendChild(body);
  panel.appendChild(el('div', 'da-powered', 'Propulsé par Devis AI'));

  root.appendChild(launcher);
  root.appendChild(panel);

  const chat = createChat(body, { config, api });

  let open = false;
  function toggle(force) {
    open = force != null ? force : !open;
    panel.classList.toggle('is-open', open);
    launcher.innerHTML = open ? ICON_CLOSE : ICON_CHAT;
    if (open) setTimeout(() => chat.focus(), 50);
  }
  launcher.addEventListener('click', () => toggle());
  closeBtn.addEventListener('click', () => toggle(false));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
