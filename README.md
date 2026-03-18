# Property Management Application

Application de gestion locative pour 6 SCI partageant 3 immeubles avec environ 20 locataires.

## 🏗️ Architecture

- **Backend**: Node.js + Express + TypeScript + PostgreSQL
- **Frontend**: React + TypeScript + Tailwind CSS
- **Base de données**: PostgreSQL 14

## 📋 Modules

### Module 1: État Locatif
- Gestion SCI, Immeubles, Lots, Baux, Locataires
- Indexation automatique des loyers
- Calcul de la vacance
- Export état locatif

### Module 2: Compte Rendu de Gestion
- Génération de quittances (mensuel/trimestriel)
- Export PDF des quittances
- Envoi emails aux locataires + relances
- Suivi des encaissements
- Tableaux de bord

## 🚀 Installation

### Prérequis

- Node.js v18+
- PostgreSQL 14+
- npm ou yarn

### Configuration de la base de données

1. Créer la base de données:
```bash
psql postgres
CREATE DATABASE property_management;
CREATE USER prop_admin WITH PASSWORD 'PropMgt2024!';
GRANT ALL PRIVILEGES ON DATABASE property_management TO prop_admin;
\q
```

2. Importer le schéma:
```bash
psql -U prop_admin -d property_management -f database_schema.sql
```

### Installation du Backend

```bash
cd backend
npm install
cp .env.example .env
# Éditer .env avec vos paramètres
npm run dev
```

Le backend sera accessible sur http://localhost:3000

### Installation du Frontend

```bash
cd frontend
npm install
npm run dev
```

Le frontend sera accessible sur http://localhost:5173

## 🔐 Connexion par défaut

- **Email**: admin@property.com
- **Mot de passe**: Admin123!

## 📁 Structure du projet

```
property-management/
├── backend/              # API Node.js + Express
│   ├── src/
│   │   ├── config/      # Configuration (DB, env)
│   │   ├── controllers/ # Logique métier
│   │   ├── models/      # Modèles de données
│   │   ├── routes/      # Routes API
│   │   ├── services/    # Services (email, PDF, etc.)
│   │   ├── middleware/  # Authentification, validation
│   │   └── utils/       # Utilitaires
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/            # Application React
│   ├── src/
│   │   ├── components/  # Composants réutilisables
│   │   ├── pages/       # Pages de l'application
│   │   ├── services/    # Appels API
│   │   ├── hooks/       # Hooks personnalisés
│   │   ├── types/       # Types TypeScript
│   │   └── utils/       # Utilitaires
│   ├── package.json
│   └── vite.config.ts
│
└── database_schema.sql  # Schéma de la base de données
```

## 🛠️ Scripts disponibles

### Backend
- `npm run dev` - Démarrer en mode développement
- `npm run build` - Compiler le TypeScript
- `npm start` - Démarrer en production

### Frontend
- `npm run dev` - Démarrer en mode développement
- `npm run build` - Build pour production
- `npm run preview` - Prévisualiser le build

## 📚 API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/me` - Utilisateur connecté

### SCI
- `GET /api/sci` - Liste des SCI
- `POST /api/sci` - Créer une SCI
- `PUT /api/sci/:id` - Modifier une SCI
- `DELETE /api/sci/:id` - Supprimer une SCI

### Immeubles
- `GET /api/immeubles` - Liste des immeubles
- `POST /api/immeubles` - Créer un immeuble
- `PUT /api/immeubles/:id` - Modifier un immeuble

### Lots
- `GET /api/lots` - Liste des lots
- `GET /api/lots/immeuble/:id` - Lots d'un immeuble
- `POST /api/lots` - Créer un lot

### Locataires
- `GET /api/locataires` - Liste des locataires
- `POST /api/locataires` - Créer un locataire
- `PUT /api/locataires/:id` - Modifier un locataire

### Baux
- `GET /api/baux` - Liste des baux
- `POST /api/baux` - Créer un bail
- `PUT /api/baux/:id` - Modifier un bail
- `POST /api/baux/:id/indexation` - Indexer un bail

### Quittances
- `GET /api/quittances` - Liste des quittances
- `POST /api/quittances/generate` - Générer des quittances
- `GET /api/quittances/:id/pdf` - Télécharger le PDF
- `POST /api/quittances/:id/send` - Envoyer par email

### Encaissements
- `GET /api/encaissements` - Liste des encaissements
- `POST /api/encaissements/import` - Importer depuis Pennylane
- `POST /api/encaissements/:id/lettrage` - Lettrer un encaissement

### Rapports
- `GET /api/reports/etat-locatif` - État locatif
- `GET /api/reports/compte-rendu-gestion` - Compte rendu de gestion
- `GET /api/reports/vacance` - Taux de vacance

## 🔄 Processus automatisés

### Indexation automatique
- Cron job quotidien qui vérifie les baux à indexer
- Récupération automatique des indices INSEE
- Calcul et application du nouveau loyer

### Génération de quittances
- Cron job le 1er du mois
- Génération automatique selon la fréquence du bail
- Envoi automatique par email

### Relances
- Vérification quotidienne des impayés
- Envoi automatique selon le délai configuré

## 🎨 Technologies utilisées

### Backend
- Node.js & Express
- TypeScript
- PostgreSQL & node-postgres
- JWT pour l'authentification
- PDFKit pour la génération de PDF
- Nodemailer pour les emails
- Node-cron pour les tâches planifiées

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- React Query
- Axios
- Recharts pour les graphiques

## 📄 Licence

Propriétaire - Tous droits réservés
