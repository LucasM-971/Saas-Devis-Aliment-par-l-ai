# Devis AI

**Devis AI** est un SaaS B2B pour artisans et PME du bâtiment (peintres, etc.) qui **transforme une
conversation de chat en devis chiffré**. Le client final discute avec un **chatbot** (intégré au site
de l'entreprise ou via un lien hébergé) ; l'IA qualifie sa demande, et le système génère un **devis
brouillon** calculé à partir de la **grille tarifaire** de l'entreprise. L'artisan le relit, l'ajuste
et l'envoie depuis son **dashboard**.

> **Principe clé : l'IA ne calcule jamais un prix.** Elle comprend et extrait (prestation, code
> postal, quantités, coordonnées) ; le chiffrage est fait par un moteur **déterministe** en Python
> (`Decimal`, arrondi au centime). Mêmes entrées → même devis, toujours.

---

## Sommaire

1. [Fonctionnement global](#1-fonctionnement-global)
2. [Architecture du dépôt](#2-architecture-du-dépôt)
3. [Stack technique](#3-stack-technique)
4. [Lancer le projet](#4-lancer-le-projet)
5. [Comptes de démo](#5-comptes-de-démo)
6. [Configuration (variables d'environnement)](#6-configuration-variables-denvironnement)
7. [Backend en détail](#7-backend-en-détail)
8. [Dashboard en détail](#8-dashboard-en-détail)
9. [Widget en détail](#9-widget-en-détail)
10. [Abonnements, rôles, sécurité](#10-abonnements-rôles-sécurité)
11. [Tests et qualité](#11-tests-et-qualité)
12. [CI/CD et production](#12-cicd-et-production)
13. [Dépannage](#13-dépannage)
14. [Documents annexes](#14-documents-annexes)

---

## 1. Fonctionnement global

```
 Client final                     Devis AI                                    Artisan
 ────────────                     ────────                                    ───────
 Site de l'artisan  ─┐
 (widget embarqué)   ├─► POST /api/v1/chat/message ─► LLM : répond en s'appuyant sur
 ou lien /c/:id     ─┘        (public, rate-limité)     la base de connaissances (FAQ)
                                     │
                                     ▼  la conversation est sauvegardée à chaque tour
                          POST /api/v1/chat/quote
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
         1. Extraction LLM structurée     (services et postes imposés par enum :
            service, CP, quantités,        le modèle ne peut rien inventer)
            nom / e-mail / téléphone
                     │
         2. Éligibilité : prestation proposée ? code postal desservi ? quota OK ?
                     │
           ┌─────────┴──────────┐
           ▼ oui                ▼ non
   3. Moteur de prix       → LEAD (prospect) avec la raison :
      lignes → HT → remise    unsupported_service / out_of_zone / incomplete / quota
      → TVA → TTC
           │
           ▼
   DEVIS BROUILLON en base  ─────────────────────────────────►  Dashboard : relecture,
   (1 conversation = 1 brouillon, idempotent)                    édition, PDF, envoi e-mail
```

### Cycle de vie d'un devis

```
draft ──► pending ──► validated ──► sent ──► accepted
  │          │            │           └────► rejected
  │          └────────────┴──────────────►   rejected
  └──────────┴────────────┴───────────┴───►  expired
```

Transitions contrôlées côté serveur (`backend/app/services/quote_state_machine.py`).
`accepted`, `rejected` et `expired` sont terminaux. Chaque modification crée une version
(`quote_versions`) et une entrée dans le journal d'activité.

---

## 2. Architecture du dépôt

```
.
├── backend/                  API FastAPI + MySQL
│   ├── app/
│   │   ├── main.py           création de l'app, CORS, montage des routers, /health
│   │   ├── config.py         Settings (pydantic-settings, lit backend/.env)
│   │   ├── database.py       engine SQLAlchemy, session
│   │   ├── api/v1/           routers HTTP (auth, quotes, chat, pricing, …)
│   │   ├── models/           entités ORM (tables MySQL)
│   │   ├── schemas/          contrats JSON entrée/sortie (Pydantic)
│   │   ├── services/         logique métier (moteur de prix, TVA, statuts, PDF, e-mail…)
│   │   ├── llm/              client multi-fournisseur, prompts, extraction structurée
│   │   ├── email/            envoi (console / SMTP) + templates HTML
│   │   └── core/             sécurité (JWT, bcrypt), rate limiting
│   ├── alembic/versions/     migrations = SEULE source du schéma
│   ├── scripts/              seed, démo e2e, métriques pilote, sauvegarde MySQL
│   ├── sql/local-setup.sql   crée les bases devis_ai + devis_ai_test et l'utilisateur
│   ├── tests/                ~35 fichiers pytest
│   ├── Dockerfile · entrypoint.sh · requirements.txt
├── dashboard/                SPA React (espace artisan + landing + chat hébergé)
│   └── src/{pages,components,layouts,context,hooks,lib}
├── widget/                   chatbot embarquable vanilla JS (Shadow DOM)
│   ├── src/embed.js · chat.js · api.js
│   └── chat-demo.html        page de démo du widget
├── docker-compose.yml        dev : db + backend + dashboard (+ seed)
├── docker-compose.prod.yml   prod pilote : db + backend + backup
├── .env.prod.example         modèle des secrets de prod
└── .github/workflows/        ci.yml · cd.yml · codeql.yml
```

---

## 3. Stack technique

| Couche     | Technologies                                                                   |
| ---------- | ------------------------------------------------------------------------------ |
| Backend    | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, PyMySQL, Pydantic 2              |
| Base       | MySQL 8.4                                                                      |
| IA         | Anthropic Claude (défaut), Gemini, Mistral ou Ollama (local) — au choix        |
| Auth       | JWT (python-jose) + bcrypt, Bearer uniquement (aucun cookie)                   |
| PDF        | WeasyPrint (serveur) · jsPDF (aperçu côté dashboard)                           |
| Import     | pypdf, python-docx (import d'un devis existant)                                |
| Dashboard  | React 19, TypeScript, Vite 6, Tailwind CSS v4, React Router 7, react-hook-form + Zod, lucide-react |
| Widget     | JavaScript ES modules, Shadow DOM, sans dépendance                             |
| Tests      | pytest + httpx · Vitest + Testing Library                                      |
| Qualité    | ESLint 9, Prettier, ruff, pip-audit, npm audit, CodeQL, Dependabot             |
| Infra      | Docker / Docker Compose, GitHub Actions, GHCR, Sentry (optionnel)              |

---

## 4. Lancer le projet

### Prérequis

- **Option A** : Docker (OrbStack ou Docker Desktop) — c'est tout.
- **Option B** : Python 3.13, Node 22, MySQL 8, et les libs système de WeasyPrint
  (`brew install pango` sur macOS).

### Option A — tout en Docker (recommandé)

Depuis la racine du dépôt :

```bash
docker compose up -d --build
```

```bash
docker compose --profile seed run --rm seed
```

| Service   | URL                          | Rôle                                   |
| --------- | ---------------------------- | -------------------------------------- |
| dashboard | http://localhost:5173        | front (proxy `/api` → backend)         |
| backend   | http://localhost:8000        | API — doc interactive sur `/docs`      |
| db        | `localhost:3307`             | MySQL (3307 pour ne pas gêner un 3306 natif) |

Au démarrage, le backend applique les migrations (`alembic upgrade head`, jusqu'à 15 essais
le temps que MySQL soit prêt) puis lance uvicorn. Le seed **réinitialise** les données de démo.

Commandes utiles :

```bash
docker compose logs -f backend dashboard
```

```bash
BACKEND_PORT=8017 docker compose up -d
```

```bash
docker compose down
```

(`docker compose down -v` supprime aussi la base.)

### Option B — en local, service par service

**1. Base de données**

```bash
mysql -uroot < backend/sql/local-setup.sql
```

Crée `devis_ai`, `devis_ai_test` et l'utilisateur `devis` / `devis`.
(Alternative : `docker compose up -d db`, puis `DATABASE_URL=mysql+pymysql://devis:devis@127.0.0.1:3307/devis_ai` dans `backend/.env`.)

**2. Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload
```

API sur http://localhost:8000 — santé : `/health` et `/health/db`, Swagger : `/docs`.

**3. Dashboard**

```bash
cd dashboard
npm install
npm run dev
```

http://localhost:5173 (le proxy Vite envoie `/api` vers `http://localhost:8000`).

**4. Widget (optionnel)** — ouvrir `widget/chat-demo.html`, ou l'intégrer sur une page
(voir [§9](#9-widget-en-détail)). Avec `data-company="demo"` il tourne sans backend.

### Démo bout-en-bout en une commande

```bash
cd backend && source .venv/bin/activate && python -m scripts.demo_e2e
```

Déroule : conversation → extraction (simulée sans clé LLM, réelle avec) → devis brouillon
chiffré → édition (lignes, remise, conditions) → vérification en base.

---

## 5. Comptes de démo

Créés par `scripts/seed.py` (entreprise **Atelier Dupont**, métier peinture, zones, grille,
devis, prospects et conversations d'exemple) :

| Compte                              | Mot de passe  | Rôle                    |
| ----------------------------------- | ------------- | ----------------------- |
| `lucas@atelier-dupont.fr`           | `motdepasse`  | owner                   |
| `sophie.bernard@atelier-dupont.fr`  | `motdepasse`  | équipe                  |
| `karim.haddad@atelier-dupont.fr`    | `motdepasse`  | équipe                  |
| `demo@devis-ai.fr`                  | `demo1234`    | viewer (lecture seule)  |

En `ENVIRONMENT=prod`, les comptes à privilèges reçoivent un mot de passe fort aléatoire :
seul le compte viewer garde un mot de passe public.
Raccourcis : bouton **« Accès dev »** sur la page de connexion, ou le lien **/demo** de la landing.

---

## 6. Configuration (variables d'environnement)

Le backend lit `backend/.env` (jamais commité). Toutes les variables sont optionnelles en dev.

| Variable                 | Défaut                                              | Rôle |
| ------------------------ | --------------------------------------------------- | ---- |
| `DATABASE_URL`           | `mysql+pymysql://devis:devis@localhost:3306/devis_ai` | connexion MySQL |
| `SECRET_KEY`             | `change-me`                                          | signature des JWT — **refus de démarrer en prod** si faible ou < 32 car. |
| `ENVIRONMENT`            | `dev`                                                | `dev` ou `prod` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440`                                         | durée de vie du JWT (24 h) |
| `LLM_PROVIDER`           | `anthropic`                                          | `anthropic`, `gemini`, `mistral` ou `ollama` |
| `ANTHROPIC_API_KEY`      | —                                                    | clé Claude |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / `gemini-2.5-flash`                      | Gemini |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | — / `mistral-small-latest`                | Mistral |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://host.docker.internal:11434` / `qwen2.5:7b` | LLM local |
| `FRONTEND_URL`           | `http://localhost:5173`                              | liens dans les e-mails |
| `RATE_LIMIT_ENABLED`     | `true`                                               | `false` pour couper la limite en local |
| `TRUST_PROXY_HEADERS`    | `false`                                              | `true` derrière un reverse proxy (lit `X-Forwarded-For`) |
| `EMAIL_MODE`             | `console`                                            | `console` (log) ou `smtp` (envoi réel) |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TIMEOUT_SECONDS` | — | SMTP (ex. Resend : `smtp.resend.com`, user `resend`) |
| `SENTRY_DSN`             | —                                                    | active Sentry si renseigné |
| `TEST_DATABASE_URL`      | base `devis_ai_test`                                 | base utilisée par pytest |

**Sans aucun LLM configuré** : le chat du widget bascule sur un matching local (FAQ/blocs) et
la génération de devis depuis le chat renvoie un **503** (géré proprement par le front).

Côté dashboard : `VITE_API_URL` (base de l'API ; vide = même origine via le proxy) et
`API_PROXY_TARGET` (cible du proxy Vite, défaut `http://localhost:8000`).

---

## 7. Backend en détail

### Modèle de données (tables MySQL)

| Domaine        | Tables |
| -------------- | ------ |
| Comptes        | `users`, `password_reset_tokens`, `email_verification_tokens` |
| Multi-tenant   | `companies` (dont `plan` free/premium), `memberships` (rôle), `invitations`, `api_keys` |
| Tarification   | `services` (prestations), `service_zones` (codes postaux desservis), `price_items` (grille) |
| Devis          | `quotes`, `quote_lines`, `quote_versions`, `quote_templates` |
| Chat           | `conversations` (transcript horodaté par tour), `widget_settings`, `questions` (base de connaissances) |
| Commercial     | `leads` (prospects non chiffrables + raison) |
| Traçabilité    | `audit_logs` |

Migrations Alembic : `001_schema_initial` → `002_notifications` → `003_mentions_legales` →
`004_conversations` → `005_envoi_devis`. Nouvelle migration :
`alembic revision -m "message"` puis `alembic upgrade head`.

### Endpoints (préfixe `/api/v1`)

| Ressource          | Endpoints |
| ------------------ | --------- |
| `auth`             | `POST /register` · `POST /login` · `POST /forgot-password` · `POST /reset-password` · `GET/PATCH /me` |
| `companies`        | `GET/PATCH /current` · `POST ""` (nouvelle entreprise, premium) |
| `billing`          | `GET /plans` · `GET /plan` · `POST /plan` (changement simulé, Stripe gelé) |
| `quotes`           | `GET ""` · `POST ""` · `POST /import` (PDF/DOCX → brouillon) · `POST /sample` · `PATCH /{id}` · `PATCH /{id}/status` · `POST /{id}/send` · `DELETE /{id}` |
| `quote-templates`  | `GET ""` · `PATCH ""` (logo, couleurs, mise en page canvas) |
| `pricing`          | `GET/PUT /items` (grille tarifaire) |
| `zones`            | `GET/PUT ""` (zones d'intervention) |
| `leads`            | `GET ""` · `POST /{id}/convert` (prospect → devis brouillon) |
| `members`          | `GET ""` · `PATCH /{id}` · `DELETE /{id}` |
| `invitations`      | `POST ""` · `DELETE /{id}` · `GET /lookup/{token}` · `POST /accept` |
| `chat` (public)    | `POST /message` · `POST /quote` · `GET /config/{company_public_id}` |
| `conversations`    | `GET /{id}` (transcript) |
| `widget`           | `GET/PUT /settings` · `POST /preview/message` (aperçu authentifié) |
| `onboarding`       | `GET ""` (checklist de démarrage) |
| `stats`            | `GET ""` · `GET /platform` |
| `audit`            | `GET ""` (journal paginé) |
| hors préfixe       | `GET /health` · `GET /health/db` |

Documentation complète et testable : http://localhost:8000/docs.

### Services métier clés (`app/services/`)

- `pricing_engine.py` — calcul pur : lignes → sous-total HT → remise (`percent`/`amount`) → HT net → TVA → TTC.
- `vat.py` — taux de TVA (10 % rénovation, 20 %, etc.).
- `eligibility.py` — prestation supportée + code postal desservi, sinon raison du lead.
- `quota.py` / `features.py` — limites et fonctionnalités par plan.
- `quote_builder.py` — assemble un brouillon depuis l'extraction + la grille.
- `quote_state_machine.py` / `quote_status.py` — transitions de statut.
- `quote_pdf.py` — rendu PDF WeasyPrint · `quote_mailer.py` — envoi du devis au client.
- `quote_import.py` — extraction de texte d'un PDF/DOCX pour recréer un devis.
- `permissions.py` — droits par rôle · `audit_service.py` — journal d'activité.
- `widget_kb.py` — base de connaissances du chatbot lue en base.
- `company_setup.py` — activation guidée (métier → service chiffrable, zone).

### Couche IA (`app/llm/`)

- `client.py` — appel unique `_structured_call` routé vers Anthropic / Gemini / Mistral / Ollama,
  avec **cache TTL** des réponses et nettoyage des boutons de réponse rapide.
- `prompts.py` — prompts système (réponses ancrées sur la FAQ de l'entreprise).
- `extractor.py` — extraction **structurée** : le schéma JSON est construit par entreprise, les
  slugs de services et IDs de postes sont injectés en `enum` → le modèle ne peut pas inventer
  une prestation hors grille.
- `schemas.py` — types Pydantic de l'extraction.

### Scripts (`backend/scripts/`)

| Commande                          | Effet |
| --------------------------------- | ----- |
| `python -m scripts.seed`          | (ré)initialise les données de démo |
| `python -m scripts.demo_e2e`      | démo complète chat → brouillon → édition |
| `python -m scripts.pilot_metrics` | rapport du pilote (taux de complétion, brouillons envoyables, délai) |
| `scripts/backup_mysql.sh`         | dump compressé avec rotation (utilisé en prod) |

---

## 8. Dashboard en détail

### Routes

| Route                  | Page | Accès |
| ---------------------- | ---- | ----- |
| `/`                    | Landing (présentation, métiers, tarifs) | public |
| `/demo`                | Entrée directe en démo | public |
| `/c/:publicId`         | **Chat hébergé** — lien à donner aux clients sans site web | public |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/accept-invite` | Authentification | public |
| `/onboarding`          | Activation guidée (métier, zone) en plein écran | connecté |
| `/app`                 | Accueil : stats, pipeline, checklist de démarrage | connecté |
| `/app/quotes`          | Liste + éditeur de devis (lignes, remise, conditions, signature, PDF, envoi, import) | connecté |
| `/app/quote-template`  | Modèle de devis (canvas, logo, couleurs — premium) | connecté |
| `/app/leads`           | Prospects non chiffrés + conversion en devis | connecté |
| `/app/chat`            | Configuration et aperçu du chatbot (apparence, FAQ, blocs) | connecté |
| `/app/members`         | Équipe et invitations | connecté |
| `/app/audit`           | Journal d'activité | connecté |
| `/app/subscription`    | Abonnement free / premium | connecté |
| `/app/settings`        | Fiche entreprise, grille, zones, notifications, profil | connecté |
| `/app/companies/new`   | Nouvel espace entreprise (premium) | connecté |

### Organisation du code

- `context/AuthContext.tsx` — session (JWT en mémoire/stockage), utilisateur et entreprise courante.
- `components/ProtectedRoute.tsx` — redirige vers `/login` si non connecté.
- `hooks/useApi.ts` — chargement de données avec états loading / erreur.
- `lib/api.ts` — client HTTP (en-têtes d'auth, gestion d'erreurs).
- `lib/` — logique pure testée : `quote-math`, `quote-status`, `quote-pdf`, `catalog`, `units`,
  `leads`, `stats`, `audit`, `onboarding`, `chat-match`, `roles`, `trades`…
- `lib/validation/` — schémas Zod des formulaires.
- `components/ui/` — composants de base ; `components/chat/` — UI du chat.

---

## 9. Widget en détail

Chatbot embarquable sur **n'importe quel site**, rendu dans un **Shadow DOM** (aucun conflit de
style avec la page hôte). À placer juste avant `</body>` :

```html
<script type="module"
        src="https://cdn.devis-ai.fr/widget.js"
        data-company="VOTRE_PUBLIC_ID"
        data-api="https://api.devis-ai.fr"></script>
```

| Attribut        | Requis | Rôle |
| --------------- | ------ | ---- |
| `data-company`  | oui    | identifiant public de l'entreprise (`demo` = mode démo sans backend) |
| `data-api`      | non    | base de l'API (défaut `https://api.devis-ai.fr`) |
| `data-color`    | non    | force la couleur d'accent |
| `data-position` | non    | `left` pour ancrer la bulle à gauche |

Fichiers : `embed.js` (point d'entrée, styles, bulle), `chat.js` (logique de conversation),
`api.js` (appels `/chat/config`, `/chat/message`, `/chat/quote`). En local, pointer `data-api`
vers `http://localhost:8000`. Le build/CDN n'est pas encore implémenté (`npm run build` est un
placeholder) : pour le pilote, c'est la page hébergée `/c/:publicId` qui est utilisée.

---

## 10. Abonnements, rôles, sécurité

### Plans (gates appliquées côté serveur, reflétées dans l'UI)

| Fonctionnalité                         | Free                | Premium   |
| -------------------------------------- | ------------------- | --------- |
| Devis générés par mois                 | 10 (au-delà → lead) | illimités |
| Personnalisation du modèle de devis    | —                   | ✅        |
| Multi-entreprises                      | —                   | ✅        |

Stripe est gelé : le changement de plan est simulé via `POST /api/v1/billing/plan`.

### Rôles d'équipe

| Rôle   | Devis & prospects | Configuration (grille, zones, assistant, fiche, modèle) | Abonnement |
| ------ | ----------------- | -------------------------------------------------------- | ---------- |
| owner  | ✅                | ✅                                                        | ✅         |
| admin  | ✅                | ✅                                                        | —          |
| member | ✅                | —                                                         | —          |
| viewer | lecture seule     | —                                                         | —          |

Les invitations sont envoyées par e-mail (lien valable 7 jours) ; l'invité crée son compte ou
confirme son mot de passe existant.

### Sécurité

- Mots de passe hachés en **bcrypt**, sessions **JWT Bearer** (pas de cookie → pas de CSRF).
- **CORS ouvert** volontairement (widget sur sites tiers) avec `allow_credentials=False`.
- **Rate limiting par IP** sur le chat public et l'authentification.
- **Isolation multi-tenant** : chaque requête est filtrée par l'entreprise courante.
- Refus de démarrer en prod avec une `SECRET_KEY` faible.
- Validation stricte des entrées (Pydantic) ; `NaN`/`Infinity` neutralisés dans les erreurs 422.
- Conteneur backend exécuté en utilisateur non-root ; MySQL non exposé en prod.

---

## 11. Tests et qualité

**Backend** (utilise la base `devis_ai_test`) :

```bash
cd backend && source .venv/bin/activate && pytest
```

Couvre : moteur de prix, TVA, remises, éligibilité, machine à états, PDF, import, envoi e-mail,
chat (LLM, extraction, cache, fournisseurs), permissions, invitations, gates premium, durcissement
SaaS/public, migrations.

**Dashboard** :

```bash
cd dashboard
npm run lint
npm run typecheck
npm run test
npm run build
```

(`npm run format` pour Prettier, `npm run test:watch` en mode watch.)

---

## 12. CI/CD et production

### Workflow Git

Trois environnements : `dev` → `staging` → `prod`. Chaque changement se fait sur une branche
(`feat/...`, `fix/...`) mergée dans `dev`. Commits en français.

### CI (`.github/workflows/ci.yml`) — sur chaque push/PR vers `dev`, `staging`, `prod`

- **Dashboard** : lint, typecheck, tests, build, `npm audit` (high+).
- **Widget** : vérification de syntaxe des modules.
- **Backend** : MySQL de service, ruff (erreurs bloquantes), import de l'app, pytest, `pip-audit`.
- **Docker** : build de l'image backend.
- + **CodeQL** et **Dependabot**.

### CD (`.github/workflows/cd.yml`)

Déclenché uniquement si la CI réussit sur `staging` ou `prod` : build et publication de l'image
sur **GHCR**, puis déploiement par SSH sur le VPS et healthcheck.
Secrets GitHub par environnement : `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
`DEPLOY_PATH` ; variable optionnelle `HEALTHCHECK_URL`.

### Déployer à la main (VPS)

```bash
cp .env.prod.example backend/.env.prod
```

Remplir les secrets (`SECRET_KEY`, mots de passe MySQL, clé LLM, SMTP…), puis :

```bash
docker compose -f docker-compose.prod.yml up -d
```

- MySQL n'est pas exposé ; l'API écoute sur `127.0.0.1:8000`, derrière un reverse proxy TLS
  (Caddy ou Nginx) avec `TRUST_PROXY_HEADERS=true`.
- Le service `backup` fait un dump quotidien dans `./backups` (rétention `BACKUP_RETENTION_DAYS`,
  14 jours) — à copier régulièrement hors du VPS.

---

## 13. Dépannage

| Problème | Solution |
| -------- | -------- |
| Port 8000 déjà pris | `BACKEND_PORT=8017 docker compose up -d` |
| Port 3306 occupé | la base Docker est déjà sur **3307** |
| Le backend redémarre en boucle | `docker compose logs backend` — souvent une migration en échec ou MySQL pas prêt |
| Chat : « service indisponible » / 503 sur le devis | aucun LLM configuré : renseigner `LLM_PROVIDER` + la clé, ou lancer Ollama |
| Ollama injoignable depuis Docker | vérifier `ollama serve` sur l'hôte ; l'URL par défaut est `host.docker.internal:11434` |
| Erreur WeasyPrint au `pip install` / au PDF | installer pango (`brew install pango`) — inutile en Docker |
| 429 Too Many Requests en local | `RATE_LIMIT_ENABLED=false` dans `backend/.env` |
| Les e-mails ne partent pas | normal en dev (`EMAIL_MODE=console`) : ils sont dans les logs du backend |
| `npm ci` échoue dans Docker après un install macOS | le volume `dashboard_node_modules` isole les binaires : `docker compose down -v` puis relancer |
| Données de démo corrompues | `docker compose --profile seed run --rm seed` |

---

## 14. Documents annexes

- [ROADMAP.md](ROADMAP.md) — fonctionnalités faites, gelées, et objectifs du pilote.
- [TODOS.md](TODOS.md) — dette technique consignée (purge RGPD, stubs vides…).
- [architecture-mvc.md](architecture-mvc.md) — proposition de restructuration MVC (non appliquée).
