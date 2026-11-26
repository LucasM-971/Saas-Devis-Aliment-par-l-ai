# Architecture MVC — Devis AI

> Proposition de restructuration (2026-11-25). Aucun fichier n'a encore été déplacé :
> ce document décrit l'état actuel, la cible et l'ordre de migration.

## 1. Le principe, appliqué à ce projet

Devis AI est une **API** (FastAPI) consommée par une **SPA** (React) et un **widget**.
Le MVC s'applique donc deux fois, avec un sens précis à chaque couche :

| Couche          | Backend (FastAPI)                                                    | Dashboard (React)                                         |
| --------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| **Model**       | ORM SQLAlchemy + accès aux données (repositories) + règles métier pures | Types, validation Zod, logique métier pure (calculs, statuts) |
| **View**        | Ce qui sort : schémas Pydantic (JSON), templates e-mail, rendu PDF   | Pages, layouts, composants — **aucun appel API direct**   |
| **Controller**  | Routers : HTTP in → appel service → View out. **Aucune requête SQL** | Hooks : chargent les données, exposent état + actions     |
| _Service_       | Orchestration métier (cas d'usage), transactions                     | Clients HTTP par ressource (`quotes.service.ts`…)         |

Règle de dépendance (à sens unique) :

```
Controller → Service → Repository → Model        (backend)
View → Controller (hook) → Service (HTTP) → Model (front)
```

## 2. Diagnostic de l'existant

**Backend — déjà proche du MVC**, il manque une couche :
- ✅ `models/`, `schemas/`, `services/`, `api/v1/` existent et sont bien séparés.
- ❌ **Pas de couche d'accès aux données** : les routers font eux-mêmes les requêtes SQL
  (`chat.py` : 27 appels DB / 604 lignes, `invitations.py` : 21, `auth.py` : 18,
  `quotes.py` / `members.py` : 13). C'est le principal écart au MVC.
- ❌ Les « views » sont éparpillées : `schemas/` d'un côté, `email/templates/` de l'autre,
  le rendu PDF dans `services/quote_pdf.py`.
- ⚠️ `backend/sql/schema.sql` contredit la convention « Alembic = seule source du schéma »
  (et le README y renvoie encore).

**Dashboard — pas de couche Controller** :
- ❌ 16 pages/composants appellent `api.get/post…` directement (`Settings.tsx` 692 l.,
  `ChatAI.tsx` 1069 l., `Landing.tsx` 1136 l.) : vue, données et logique mélangées.
- ✅ `lib/` contient surtout de la logique métier pure et testée (`quote-math`,
  `quote-status`, `units`…) : c'est déjà le Model, simplement mal nommé.
- ⚠️ `lib/chat-engine.ts` (appels API + état React) est en fait un controller.
- ⚠️ Deux générateurs de PDF de devis : `dashboard/src/lib/quote-pdf.ts` (jsPDF) et
  `backend/app/services/quote_pdf.py` (WeasyPrint). À trancher : un seul rendu de référence.

## 3. Arborescence cible — racine

```
06_Devis_Ai/
├── backend/                 # API FastAPI (MVC serveur)
├── dashboard/               # SPA React (MVC client)
├── widget/                  # Chat embarquable (vanilla JS, Shadow DOM)
├── docs/
│   └── architecture-mvc.md  # ce document
├── docker-compose.yml       # dev : db + backend + dashboard (+ seed)
├── docker-compose.prod.yml
├── CLAUDE.md · README.md · ROADMAP.md · TODOS.md
```

## 4. Arborescence cible — backend

```
backend/
├── app/
│   ├── main.py                     # création de l'app, middlewares, montage des routers
│   ├── config.py                   # Settings (pydantic-settings)
│   ├── database.py                 # engine, SessionLocal, get_db
│   │
│   ├── models/                     # ── MODEL : entités ORM (inchangé)
│   │   ├── base.py
│   │   ├── user.py · company.py · membership.py · invitation.py
│   │   ├── password_reset_token.py · api_key.py · audit_log.py
│   │   ├── quote.py · quote_version.py · quote_template.py
│   │   ├── pricing.py · question.py · lead.py
│   │   └── conversation.py · widget.py
│   │
│   ├── repositories/               # ── MODEL : accès aux données (NOUVEAU)
│   │   ├── base.py                 # BaseRepository (get, list, add, delete + filtre tenant)
│   │   ├── user_repository.py      # + password_reset_token
│   │   ├── company_repository.py
│   │   ├── membership_repository.py
│   │   ├── invitation_repository.py
│   │   ├── quote_repository.py     # + versions
│   │   ├── quote_template_repository.py
│   │   ├── pricing_repository.py   # + zones
│   │   ├── lead_repository.py
│   │   ├── conversation_repository.py
│   │   ├── widget_repository.py    # + questions / base de connaissances
│   │   ├── api_key_repository.py
│   │   └── audit_repository.py
│   │
│   ├── domain/                     # ── MODEL : règles métier pures, sans DB ni HTTP
│   │   ├── pricing_engine.py       # ← services/pricing_engine.py
│   │   ├── vat.py                  # ← services/vat.py
│   │   ├── quote_state_machine.py  # ← services/quote_state_machine.py
│   │   ├── quote_status.py
│   │   ├── eligibility.py
│   │   ├── permissions.py
│   │   ├── features.py             # gates premium
│   │   ├── quota.py
│   │   ├── references.py · slugs.py
│   │   └── conversation_flow.py
│   │
│   ├── services/                   # ── SERVICE : cas d'usage (orchestrent repos + domain)
│   │   ├── auth_service.py         # NOUVEAU — logique sortie de api/v1/auth.py
│   │   ├── company_service.py      # ← company_setup.py
│   │   ├── member_service.py       # NOUVEAU — sorti de api/v1/members.py
│   │   ├── invitation_service.py
│   │   ├── quote_service.py        # NOUVEAU — CRUD/transitions sortis de api/v1/quotes.py
│   │   ├── quote_builder.py
│   │   ├── quote_version_service.py
│   │   ├── quote_import.py
│   │   ├── quote_mailer.py
│   │   ├── sample_quote.py
│   │   ├── chat_service.py         # NOUVEAU — cœur de api/v1/chat.py (604 l.)
│   │   ├── lead_service.py
│   │   ├── widget_service.py       # ← widget_kb.py
│   │   ├── stats_service.py
│   │   ├── billing_service.py      # NOUVEAU — sorti de api/v1/billing.py
│   │   ├── api_key_service.py
│   │   └── audit_service.py
│   │
│   ├── controllers/                # ── CONTROLLER : routers HTTP minces (← api/v1/)
│   │   ├── deps.py                 # ← api/deps.py (current_user, tenant, db)
│   │   └── v1/
│   │       ├── __init__.py         # api_router : agrège tous les routers
│   │       ├── auth.py · companies.py · members.py · invitations.py
│   │       ├── quotes.py · quote_templates.py · pricing.py · zones.py
│   │       ├── leads.py · conversations.py · chat.py · questions.py
│   │       ├── widget.py · onboarding.py · stats.py · audit.py
│   │       └── billing.py · api_keys.py · webhooks.py
│   │
│   ├── views/                      # ── VIEW : tout ce qui est rendu vers l'extérieur
│   │   ├── schemas/                # ← schemas/ (Pydantic : contrats JSON in/out)
│   │   │   ├── auth.py · company.py · member.py · invitation.py
│   │   │   ├── quote.py · quote_template.py · pricing.py · stats.py
│   │   │   └── lead.py · conversation.py · question.py · widget.py · audit.py
│   │   ├── emails/                 # ← email/templates/
│   │   │   ├── invite_user.html · quote_to_client.html
│   │   │   └── reset_password.html · verify_email.html
│   │   └── pdf/
│   │       └── quote_pdf.py        # ← services/quote_pdf.py (rendu WeasyPrint)
│   │
│   ├── integrations/               # Adaptateurs vers l'extérieur
│   │   ├── llm/                    # ← llm/ (client Anthropic, prompts, extractor, schemas)
│   │   └── email/                  # ← email/sender.py (console / SMTP)
│   │
│   └── core/                       # Transverse (inchangé)
│       ├── security.py · tenant.py · rate_limit.py · exceptions.py
│       └── logging.py              # ← utils/logging.py
│
├── alembic/                        # SEULE source du schéma
├── scripts/                        # seed.py, demo_e2e.py, pilot_metrics.py, backup_mysql.sh
├── tests/
│   ├── unit/                       # domain/ et services/ (sans HTTP)
│   ├── api/                        # controllers via TestClient
│   └── conftest.py
├── Dockerfile · entrypoint.sh · requirements.txt · alembic.ini
└── .env.example · .env.prod.example
# sql/schema.sql → à supprimer (contredit Alembic) ; sql/local-setup.sql → scripts/
```

**Contrat d'un controller** (exemple cible) :

```python
@router.post("/{quote_id}/send", response_model=QuoteOut)
def send_quote(quote_id: int, ctx: TenantCtx = Depends(tenant_ctx), svc: QuoteService = Depends()):
    return svc.send(ctx, quote_id)      # ni db.query, ni règle métier ici
```

## 5. Arborescence cible — dashboard

```
dashboard/src/
├── main.tsx
├── app/
│   ├── App.tsx                     # ← App.tsx
│   └── routes.tsx                  # table des routes (sortie de App.tsx)
│
├── models/                         # ── MODEL : types + règles métier pures (← lib/, types.ts)
│   ├── types/                      # ← types.ts découpé par domaine
│   │   ├── quote.ts · lead.ts · company.ts · member.ts
│   │   └── conversation.ts · stats.ts · audit.ts · auth.ts
│   ├── quote/
│   │   ├── quote-math.ts (+ .test) · quote-status.ts (+ .test)
│   │   ├── quotes.ts (+ .test)    · units.ts · catalog.ts (+ .test)
│   ├── chat/
│   │   ├── chat-match.ts (+ .test) · chat-defaults.ts
│   ├── leads.ts · stats.ts · audit.ts · onboarding.ts   (+ .test)
│   ├── roles.ts · trades.ts
│   └── validation/                 # schémas Zod (← lib/validation/)
│       ├── auth.ts · settings.ts
│
├── services/                       # ── SERVICE : appels HTTP, un fichier par ressource
│   ├── http.ts                     # ← lib/api.ts (fetch, en-têtes auth/tenant, erreurs)
│   ├── auth.service.ts · company.service.ts · member.service.ts
│   ├── quote.service.ts · template.service.ts · pricing.service.ts
│   ├── lead.service.ts · conversation.service.ts · chat.service.ts
│   └── stats.service.ts · audit.service.ts · billing.service.ts · onboarding.service.ts
│
├── controllers/                    # ── CONTROLLER : hooks (état + actions), seuls à appeler services/
│   ├── auth/
│   │   ├── AuthContext.tsx · auth-context.ts · useAuth.ts
│   ├── useApi.ts                   # hook générique de chargement
│   ├── useQuotes.ts · useQuoteForm.ts · useQuoteTemplate.ts
│   ├── useLeads.ts · useMembers.ts · useAudit.ts · useDashboardStats.ts
│   ├── useSettings.ts · useSubscription.ts · useOnboarding.ts
│   └── useChatEngine.ts            # ← lib/chat-engine.ts
│
├── views/                          # ── VIEW : rendu uniquement (props in, events out)
│   ├── pages/                      # ← pages/ — chaque page = 1 hook controller + composants
│   │   ├── Landing.tsx · DemoEntry.tsx · HostedChat.tsx
│   │   ├── Dashboard.tsx · Quotes.tsx · QuoteTemplate.tsx · Leads.tsx
│   │   ├── ChatAI.tsx · Members.tsx · Audit.tsx · Settings.tsx · Subscription.tsx
│   │   ├── Onboarding.tsx · CompanyNew.tsx
│   │   └── auth/  Login · Register · ForgotPassword · ResetPassword · VerifyEmail · AcceptInvite
│   ├── layouts/                    # AuthLayout · DashboardLayout
│   ├── components/
│   │   ├── ui/                     # primitives (Button, Input, Modal, Drawer…)
│   │   ├── quote/                  # QuoteFormModal · QuoteCanvasEditor · QuoteTemplateEditor · StatusBadge
│   │   ├── chat/                   # ChatThread · ConversationModal · accent.ts
│   │   ├── landing/                # sections extraites de Landing.tsx (1136 l.)
│   │   ├── settings/               # onglets extraits de Settings.tsx (692 l.)
│   │   └── shared/                 # Sidebar · Topbar · PageHeader · StatCard · EmptyState · AsyncStates…
│   └── pdf/
│       ├── quote-pdf.ts (+ .test)  # ← lib/quote-pdf.ts (voir point d'attention §2)
│       └── canvas-layout.ts
│
├── lib/                            # utilitaires techniques sans métier
│   ├── cn.ts · format.ts · nav.ts
├── test/setup.ts
├── index.css · vite-env.d.ts
```

**Contrat d'une page** (exemple cible) :

```tsx
export default function Quotes() {
  const { quotes, status, send, remove } = useQuotes();   // controller
  return <QuoteList quotes={quotes} status={status} onSend={send} onDelete={remove} />;
}
```

## 6. Widget

Trop petit pour justifier des dossiers ; on garde 3 fichiers avec des rôles nets :

```
widget/src/
├── embed.js   # point d'entrée : lit data-*, monte le Shadow DOM (controller)
├── api.js     # appels HTTP publics /api/v1/widget, /chat (service)
└── chat.js    # rendu de la bulle et des messages (view)
```

## 7. Ordre de migration (petits PR, tests verts à chaque étape)

1. **Backend — repositories** : créer `repositories/` et y sortir les requêtes de
   `chat.py`, `invitations.py`, `auth.py` en premier (les plus chargés). Les tests API
   existants servent de filet.
2. **Backend — controllers minces** : sortir la logique restante des routers vers
   `services/` (`auth_service`, `quote_service`, `chat_service`, `member_service`, `billing_service`).
3. **Backend — renommages** : `api/` → `controllers/`, `schemas/` → `views/schemas/`,
   services purs → `domain/`, `llm/` + `email/` → `integrations/`. Pur déplacement + imports.
4. **Backend — ménage** : supprimer `sql/schema.sql`, mettre à jour le README.
5. **Front — services** : `lib/api.ts` → `services/http.ts` + un `*.service.ts` par ressource.
6. **Front — controllers** : un hook par page ; plus aucun `api.*` dans `views/`
   (vérifiable : `grep -r "services/" src/views` doit être vide).
7. **Front — renommages** : `lib/` métier → `models/`, `pages|layouts|components` → `views/`,
   alias `@/models`, `@/services`, `@/controllers`, `@/views`.
8. **Découpage des gros fichiers** : `Landing.tsx`, `ChatAI.tsx`, `Settings.tsx`.

Les étapes 3 et 7 sont des déplacements purs : à faire dans un PR isolé chacun, sans
autre changement, pour que le diff reste relisible.
