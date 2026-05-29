# Procédure de déploiement — Naturo Pro

L'app tourne en production sur un hébergement Node.js mutualisé (Hostinger Cloud Professional).

> **Règle absolue** : ne **jamais** déployer sans validation explicite. Toujours backup avant.

---

## Variables d'environnement attendues

Les **vraies valeurs** ne sont jamais dans ce repo. Stocke-les dans un fichier `.env` local (gitignored) ou dans un gestionnaire de secrets.

Voir `.env.example` à la racine pour la liste complète et leur format.

| Variable | Source |
|---|---|
| `DB_*` | Panneau hébergeur (création DB MySQL) |
| `SESSION_SECRET` | Générer une fois : `openssl rand -hex 32` |
| `MAILJET_API_KEY` / `MAILJET_API_SECRET` | Dashboard Mailjet → API Key Management |
| `GOOGLE_*` | Console Google Cloud → APIs & Services → Credentials |
| `PUBLIC_URL` | URL réelle de l'app (ex: `https://app.example.com`) |

---

## Build local

```bash
# Node 24 recommandé (matche la version prod)
npm install
npm run build
```

Produit :
- `dist/index.cjs` — bundle backend (Express + dépendances) ~3-5 MB
- `dist/public/index.html` + `dist/public/assets/*.{js,css}` — frontend buildé

**Vérification avant déploiement** :
```bash
md5sum dist/index.cjs
ls -la dist/public/assets/
```

---

## Architecture de la prod

```
/home/<user>/domains/<your-domain>/nodejs/
├── dist/
│   ├── index.cjs               ← bundle Node (à remplacer)
│   ├── index.cjs.bak.<tag>     ← backups (toujours créer avant upload)
│   └── public/
│       ├── index.html
│       └── assets/             ← hashs Vite, ne pas écraser à la main
├── .env                         ← variables prod (NE JAMAIS commit)
├── package.json
├── package-lock.json
├── migrations/                  ← SQL manuel à exécuter sur la DB
└── tmp/
    └── restart.txt              ← touch ce fichier pour reload Passenger
```

L'hébergeur utilise **Phusion Passenger** : touchant `tmp/restart.txt`, le worker Node est relancé sans downtime.

---

## Procédure de déploiement standard

### 1. Backup du bundle actuel

```bash
ssh <user>@<host> "cp <APP_PATH>/dist/index.cjs <APP_PATH>/dist/index.cjs.bak.before-<phase-name>"
ssh <user>@<host> "md5sum <APP_PATH>/dist/index.cjs.bak.before-<phase-name>"
```

Note le md5 du backup pour pouvoir rollback.

### 2. Upload du nouveau bundle backend

```bash
scp dist/index.cjs <user>@<host>:<APP_PATH>/dist/index.cjs
```

### 3. Si le frontend a changé : upload des assets

Vérifie d'abord si les hashs Vite ont changé :
```bash
ssh <user>@<host> "ls <APP_PATH>/dist/public/assets/"
ls dist/public/assets/
```

Si différent :
```bash
scp dist/public/index.html <user>@<host>:<APP_PATH>/dist/public/
scp -r dist/public/assets/index-*.js <user>@<host>:<APP_PATH>/dist/public/assets/
scp -r dist/public/assets/index-*.css <user>@<host>:<APP_PATH>/dist/public/assets/
```

**Les anciens fichiers `index-XXXX.js` restent en place** (utiles si un client a un onglet ouvert avec une vieille version pendant le déploiement). Tu peux faire un cleanup périodique en supprimant les très anciens.

### 4. Restart Passenger

```bash
ssh <user>@<host> "cd <APP_PATH> && touch tmp/restart.txt && md5sum dist/index.cjs"
```

Le md5 affiché doit matcher celui que tu viens d'uploader. ✅

### 5. Smoke tests post-deploy

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://<your-domain>/
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://<your-domain>/api/me
```

Attendu : 200 sur `/`, 401 sur `/api/me` (sans cookie).

### 6. Test fonctionnel rapide

Ouvre l'app, login avec un compte de test, vérifie que l'agenda charge et que la page éditée fonctionne.

---

## Migrations DB

Les migrations sont des **fichiers SQL purs** dans `migrations/`. Tu les exécutes manuellement sur la DB de prod.

```bash
ssh <user>@<host>
cd <APP_PATH>
mysql -u <DB_USER> -p<DB_PASSWORD> -h <DB_HOST> <DB_NAME> < migrations/X.Y-name.sql
```

**Toujours faire un dump avant** :
```bash
mysqldump -u <DB_USER> -p<DB_PASSWORD> -h <DB_HOST> <DB_NAME> > backup-$(date +%Y%m%d-%H%M).sql
```

---

## Rollback

Si quelque chose casse après déploiement :

```bash
ssh <user>@<host>
cd <APP_PATH>
cp dist/index.cjs.bak.before-<phase-name> dist/index.cjs
touch tmp/restart.txt
md5sum dist/index.cjs   # doit matcher le md5 noté avant deploy
```

Smoke test pour confirmer que ça remarche.

Si la DB a aussi été modifiée :
```bash
mysql -u <DB_USER> -p<DB_PASSWORD> -h <DB_HOST> <DB_NAME> < backup-<timestamp>.sql
```

---

## Connexion SSH

Setup SSH config local (`~/.ssh/config`) :

```ssh-config
Host naturo-prod
  HostName <ton-ip-ou-hostname>
  Port <port>
  User <ton-user>
  IdentityFile ~/.ssh/<ta-clé-deploy>
```

Puis simplement `ssh naturo-prod` pour te connecter.

La clé SSH n'est **jamais** dans le repo (voir `.gitignore`). Elle vit en local sur ta machine de dev, ou dans un gestionnaire de secrets type 1Password.

---

## Checklist pré-déploiement

- [ ] Build local OK (`npm run build` sans erreur)
- [ ] `npm run check` : pas d'erreur TypeScript
- [ ] Test manuel local : flow critique ne casse pas
- [ ] Backup du bundle actuel créé sur le serveur
- [ ] Backup DB si migration SQL à passer
- [ ] Validation explicite de l'utilisateur final (Julien)
- [ ] Upload bundle
- [ ] (Si nécessaire) Upload assets frontend
- [ ] Restart Passenger
- [ ] Smoke tests HTTP OK
- [ ] Test fonctionnel manuel rapide
- [ ] md5 du bundle déployé noté quelque part

---

## CI/CD (futur)

Aujourd'hui le déploiement est manuel. Un GitHub Action pourrait automatiser :
1. Sur push `main` → run tests + build
2. Si OK → demande approval manuel (environment protection rule)
3. Si approuvé → SCP du bundle + restart

Cf. `.github/workflows/deploy.yml` (à créer).
