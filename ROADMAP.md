# ROADMAP — Devis AI

Bonus gelés pour l'instant. Le flux cœur est fonctionnel bout-en-bout :
chat de qualification → devis brouillon chiffré en base → validation par l'artisan.

## Gelé ❄️
- [ ] Paiements Stripe (abonnements, facturation) — le changement de plan est simulé en attendant
- [ ] Webhooks sortants (callbacks vers les outils du client)
- [ ] Internationalisation (i18n) — FR d'abord
- [ ] Application mobile
- [ ] Export comptable

## Fait ✅
- [x] Scaffolding du monorepo (backend, dashboard, widget)
- [x] Outillage front moderne (Vite + TS + Tailwind v4 + Vitest)
- [x] Design system + pages du dashboard (d'après Figma)
- [x] Backend FastAPI + MySQL : modèles, moteurs de calcul testés (pricing, éligibilité, statuts)
- [x] Assistant IA branché sur Claude (réponses ancrées sur la base de connaissances)
- [x] Extraction LLM verrouillée par enum → chiffrage déterministe (devis auto ou lead)
- [x] Widget chatbot embarquable (Shadow DOM) + page de chat hébergée (/c/:publicId)
- [x] Configuration du chatbot depuis le dashboard (apparence + base de connaissances)
- [x] Transcription du chat consultable par client (devis / leads)
- [x] Catalogues de prestations par métier + section Métiers sur la landing
- [x] Authentification réelle (JWT) branchée au front + compte de démo seedé
- [x] Connexion complète dashboard ↔ API : plus aucune donnée en dur
  (mode démo local supprimé, catalogue / base de connaissances / réglages persistés en base)
- [x] Migrations Alembic + seed de dev bout-en-bout (wedge : 1 métier, zones, grille liée)
- [x] Remises sur devis (%, montant) — moteur back + front testés
- [x] Conversion réelle prospect → devis brouillon
- [x] Tiers free/premium avec gates serveur + UI (quota devis, personnalisation, multi-entreprises)
- [x] Éditeur de devis enrichi : réordonnancement, conditions, cadre signature, mise en page canvas
- [x] Cache TTL des réponses du chat LLM + tests prompts/extraction/cache
- [x] Démo reproductible : `python -m scripts.demo_e2e` (chat → brouillon → édition → DB)
- [x] Activation guidée des nouveaux comptes : métier → service chiffrable auto,
  zone d'intervention (UI + API), checklist de démarrage sur l'accueil
- [x] Permissions par rôle côté serveur (viewer lecture seule, config owner/admin)
- [x] Rate limiting par IP des endpoints publics (chat) et d'auth
- [x] Journal d'activité alimenté par les vraies actions (devis, prospects, grille,
  zones, assistant, abonnement)
- [x] Suppression des brouillons de devis (API + UI)
- [x] E-mails : envoi du devis au client (statut « envoyé ») + mot de passe oublié
  (SMTP configurable, mode console en dev)
- [x] Invitations d'équipe par e-mail : envoi (owner/admin), acceptation avec
  création de compte ou vérification du mot de passe, révocation
- [x] Préférences de notifications persistées sur le profil
- [x] Journal d'activité paginé (le front charge par pages de 100)
- [x] KB lue en base sur /chat/message (fin du proxy Claude ouvert) + kb_from_config déplacée en service ; aperçu du dashboard sur endpoint authentifié dédié

## Pilote « boucle de preuve » 🎯 (priorité — design docs 2026-07-03 + 2026-07-12)
Objectif : 2 semaines chez 1-3 artisans, UN métier (candidat : peintre), via la page
hébergée `/c/:publicId` (widget embarqué différé). Métriques : ≥ 30 % de conversations
complétées, ≥ 50 % de brouillons « envoyables sans retouche », < 5 min demande → brouillon.
Rapport : `python -m scripts.pilot_metrics`. GEL des features hors de cette liste.

### Lot A — outillage (fait le 2026-07-12, revue eng CLEARED)
- [x] KB lue en base sur `/chat/message` (fin du proxy Claude ouvert)
- [x] Persistance des conversations par tour (session_uid par entreprise, transcript
  horodaté, `last_activity_at`, abandon DÉRIVÉ open>24 h — jamais de cron)
- [x] Fix collision cross-company de session_uid (UNIQUE(company_id, session_uid) — ex-500)
- [x] Idempotence `/chat/quote` : 1 conversation = 1 brouillon vivant ; brouillon
  retouché par l'artisan (`artisan_edited`) jamais écrasé ; snapshot QuoteVersion (ai)
- [x] TVA réelle : `services/vat.py` (ratio→pourcent), franchise 293 B, prêt pour le
  taux porté par l'arbre (le taux du CHANTIER primera : 10/20/5,5 pour un peintre)
- [x] `services/quote_pdf.py` : LE document (mentions légales, signature, 293 B) ;
  e-mail allégé + PDF joint ; envoi SYNCHRONE tracé (`email_status`, `sent_pdf` figé)
- [x] Cap serveur sur l'historique client (60 messages / 2 000 caractères → 422)
- [x] Front : session_uid client, FIN du repli local silencieux sur `/c/:publicId`
  (erreur visible + réessai dédupliqué serveur), mention RGPD (rétention 12 mois)
- [x] Dockerfile réel + compose Alembic-only + prod pilote (MySQL non exposé,
  backups quotidiens rotation 14 j, secrets .env, Sentry optionnel, test
  « migrations depuis base vide »)
- ~~slowapi~~ / ~~swap Resend~~ — coupés en revue : limiteur custom testé conservé ;
  Resend s'utilise par son endpoint SMTP (config, pas code)

### Lot B — gated par les appels terrain (l'arbre s'écrit depuis les appels)
- [ ] Nommer le métier pilote + écrire l'arbre de qualification (bloquant, humain —
  10 appels : voir design doc du 2026-07-12)
- [ ] `services/conversation_flow.py` : moteur d'arbre data-driven (boutons + LLM
  texte libre, fin de qualification côté serveur, `tax_rate` par nœud)
- [ ] Front : rendu des boutons d'arbre dans le chat hébergé
- [ ] Éval LLM : 10-15 transcripts RÉELS anonymisés du métier pilote (pytest @eval)
- [ ] Déploiement VPS effectif (docker-compose.prod.yml prêt) + reverse proxy TLS
- [ ] Session grille tarifaire avec l'artisan engagé + seed catalogue réaliste
- [ ] Rituel de mesure : reply OK/KO sur chaque email + point hebdo artisan

## En cours 🚧
- [ ] Envoi effectif des e-mails de notification (préférences déjà stockées)

## À venir 📌
- [ ] Widget embarqué chez les artisans : CORS public ciblé sur `/chat/*` + mise à jour du contrat widget (différé du pilote)
- [ ] Déploiement staging / prod (Docker, CI/CD)
- [ ] Suivi des relances de devis (rappels)
- [ ] Pagination des listes devis/prospects quand les volumes l'exigeront
- [ ] Rate limiting partagé (Redis) au passage en multi-instances
