# TODOS — Devis AI

## Purge automatique RGPD des conversations expirées

**What :** Mécanisme périodique qui supprime/anonymise les conversations (et leads liés) au-delà de la rétention affichée au prospect (12 mois), en préservant les devis liés (obligations comptables : conserver le devis, anonymiser le transcript).

**Why :** Le lot déploiement du pilote (eng review 2026-07-12, T7) définit la POLITIQUE de rétention affichée sur `/c/:publicId` ; sans purge automatisée, la promesse devient fausse au bout d'un an. Hors périmètre pilote (2 semaines de données), différable proprement.

**Current state :** Rien. `Conversation.transcript` (JSON avec PII) et `Lead` (nom/email/tél) s'accumulent sans limite.

**Où commencer :** commande manage-style testée (sélection par `created_at` + statut, anonymisation des transcripts liés à un devis, suppression sinon), cron ensuite.

**Depends on :** lot déploiement du pilote (politique de rétention affichée).

## Nettoyage des stubs vides de `backend/app`

**What :** Supprimer (ou implémenter) les fichiers de 0 octet : `services/api_key_service.py`, `services/lead_service.py`, `services/invitation_service.py`, `services/quote_version_service.py`, `core/exceptions.py`, `core/tenant.py`. (`conversation_flow.py` et `quote_pdf.py` seront remplis par le chantier pilote.)

**Why :** Des stubs vides sont des pièges de lecture — la revue extérieure du 2026-07-12 a failli conclure que le versioning de devis n'existait pas ; un import d'un module vide échoue en AttributeError tardive. Hors gel pilote (aucune valeur pilote), donc consigné.

**Current state :** 6 fichiers vides dans l'arbre, aucun importé (à re-vérifier par grep avant suppression).

**Où commencer :** `grep -rn "api_key_service\|lead_service\|invitation_service\|quote_version_service\|core.exceptions\|core.tenant" backend/app backend/tests` puis suppression des non-référencés. ~15 minutes.

**Depends on :** fin du gel pilote.

## Câbler la consommation de `default_vat_rate` dans `quote_builder`

**Statut 2026-07-12 :** repris dans le Lot A du chantier pilote (eng review, tâche T4) — sera soldé par ce chantier, avec la précision que le taux du CHANTIER (arbre de qualification) prime sur le défaut d'entreprise, et `vat_exempt` sur tout.

**What :** La génération de devis (`backend/app/services/quote_builder.py`) doit lire `Company.default_vat_rate` et l'appliquer aux nouveaux devis brouillons.

**Why :** Le chantier onboarding (design doc `~/.gstack/projects/jolly-austin-c7192c/lucas-claude-jolly-austin-c7192c-design-*.md`, lot 1) **ajoute** la colonne `default_vat_rate` sur `companies` et la seed selon le métier, mais ne câble pas sa consommation dans la génération de devis. La boucle de preuve du produit repose sur un devis brouillon correct : sans ce câblage, les devis générés n'appliquent pas la TVA conseillée du métier. Le champ « TVA par défaut » des Réglages (`Settings.tsx`) écrit la valeur mais elle reste inerte côté devis.

**Current state :** Après le chantier onboarding, la colonne existe en base, est exposée via `/auth/me` et éditable dans les Réglages. `quote_builder` ne la lit pas encore.

**Où commencer :** `backend/app/services/quote_builder.py` — repérer où le taux de TVA est appliqué aujourd'hui (valeur en dur ou par item), le remplacer par `company.default_vat_rate` avec fallback. Ajouter un test de calcul (convention projet : test pour chaque calcul).

**Depends on :** lot 1 du chantier onboarding (colonne `default_vat_rate`).
