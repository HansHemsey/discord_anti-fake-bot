# Anti-Fake Discord Bot

Un bot Discord pour détecter et gérer les comptes suspects et les bots malveillants.

## Fonctionnalités

- Détection automatique des comptes suspects
- Vérification des nouveaux membres
- Système de bannissement automatique des bots malveillants
- Commandes de modération avec interface boutons
- Système de logging complet
- Rate limiting pour les modérateurs

## Prérequis

- Node.js v16 ou supérieur
- Un bot Discord avec les permissions nécessaires
- Les intents suivants activés :
  - Presence Intent
  - Server Members Intent
  - Message Content Intent

## Installation

1. Clonez le repository :
```bash
git clone https://github.com/votre-username/antifake-bot.git
cd antifake-bot
```

2. Installez les dépendances :
```bash
npm install
```

3. Copiez le fichier `.env.example` en `.env` :
```bash
cp .env.example .env
```

4. Configurez votre fichier `.env` :
```
DISCORD_TOKEN=votre_token_ici
ADMIN_ID=votre_id_discord_ici
```

5. Lancez le bot :
```bash
npm start
```

## Commandes

- `!verify @utilisateur` : Vérifie un utilisateur suspect
  - Nécessite la permission `KickMembers`
  - Limite de 5 vérifications par heure (sauf pour les admins)

## Configuration

- Les administrateurs peuvent utiliser la commande sans limite
- Les logs sont stockés dans le channel #modlog
- Les actions sont enregistrées dans `audit.log`

## Sécurité

- Les tokens et IDs sensibles sont stockés dans `.env`
- Les logs contiennent des informations détaillées sur les actions
- Système de rate limiting pour éviter les abus 