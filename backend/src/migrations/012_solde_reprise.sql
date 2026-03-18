-- Migration 012 : Ajout du champ solde_reprise sur baux
-- Permet de saisir un solde impayé historique lors d'une reprise de portefeuille
-- (quittances passées non générées dans le système)

ALTER TABLE baux
  ADD COLUMN IF NOT EXISTS solde_reprise DECIMAL(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN baux.solde_reprise IS
  'Solde impayé historique au moment de la reprise du dossier dans le système (avant génération des quittances). Utilisé dans le calcul des impayés : solde_total = solde_reprise + SUM(quittances.total_ttc WHERE status = emis).';
