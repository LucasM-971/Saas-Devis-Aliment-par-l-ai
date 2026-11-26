-- Initialisation d'un MySQL LOCAL (natif, ex. Homebrew) pour le développement.
-- À lancer une fois en root, puis créer le schéma avec Alembic :
--   mysql -uroot < backend/sql/local-setup.sql
--   cd backend && alembic upgrade head && python -m scripts.seed
--
-- (Avec docker-compose, la base et l'utilisateur sont créés automatiquement
--  via les variables MYSQL_* — ce fichier ne sert que pour un MySQL natif.)

CREATE DATABASE IF NOT EXISTS devis_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Base jetable utilisée par la suite pytest (create_all / drop_all à chaque test).
CREATE DATABASE IF NOT EXISTS devis_ai_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'devis'@'localhost' IDENTIFIED BY 'devis';
CREATE USER IF NOT EXISTS 'devis'@'%' IDENTIFIED BY 'devis';
GRANT ALL PRIVILEGES ON devis_ai.* TO 'devis'@'localhost';
GRANT ALL PRIVILEGES ON devis_ai.* TO 'devis'@'%';
GRANT ALL PRIVILEGES ON devis_ai_test.* TO 'devis'@'localhost';
GRANT ALL PRIVILEGES ON devis_ai_test.* TO 'devis'@'%';
FLUSH PRIVILEGES;
