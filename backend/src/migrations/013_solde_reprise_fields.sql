-- Migration 013 : Ajout de solde_reprise_date et loyer_reprise sur baux
-- Permet de préciser le contexte lors d'une reprise de portefeuille :
--   solde_reprise_date : date d'entrée du dossier dans le système
--                        → le rattrapage d'indexation part de cette date
--   loyer_reprise      : loyer HT en vigueur à la date de reprise (déjà indexé X fois)
--                        → utilisé comme base de calcul du rattrapage si renseigné

ALTER TABLE baux
  ADD COLUMN IF NOT EXISTS solde_reprise_date DATE,
  ADD COLUMN IF NOT EXISTS loyer_reprise DECIMAL(10,2);

COMMENT ON COLUMN baux.solde_reprise_date IS
  'Date à laquelle le dossier a été repris dans le système. Le rattrapage d''indexation part de cette date au lieu de la date de début du bail.';

COMMENT ON COLUMN baux.loyer_reprise IS
  'Loyer HT en vigueur à la date de reprise (déjà indexé X fois avant la reprise). Sert de base au calcul du rattrapage si renseigné, sinon loyer_ht est utilisé.';
