import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import helmet from "helmet";
import compression from "compression";
import { registerRoutes } from "./routes/index";
import { serveStatic, registerSeoRoutes } from "./static";
import { createServer } from "node:http";
import { seedIfEmpty } from "./seed";
import { seedNaturalSolutions } from "./solutions-seed";
import { migrationsReady } from "./storage";

const app = express();

// Compression gzip/deflate sur toutes les réponses. Réduit le HTML/JS/CSS/JSON de
// 60 à 75 % sur le réseau. Le seuil de 1 Ko évite d'ajouter de l'overhead CPU sur
// les toutes petites réponses (204, redirects, JSON très courts). `filter` respecte
// l'en-tête `Cache-Control: no-transform` posé par certaines routes qui refusent
// explicitement la compression (aucune aujourd'hui, mais on garde le comportement
// standard du middleware pour ne pas casser d'éventuels ajouts futurs).
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }),
);

// L'app tourne derrière le proxy Hostinger (Passenger). Sans `trust proxy`, req.ip vaut
// l'IP du proxy pour TOUTES les requêtes : les rate-limiters partagent alors un unique
// compteur planétaire. Concrètement, 10 tentatives de connexion ratées d'un seul bot
// verrouillaient la connexion de toutes les praticiennes pendant 15 minutes, et la 31e
// réservation de l'heure — tous cabinets confondus — était refusée.
// 1 = on ne fait confiance qu'au premier proxy en amont (celui de l'hébergeur).
app.set("trust proxy", 1);
const httpServer = createServer(app);

// En-têtes de sécurité — CSP différenciée dev/prod
const isDev = process.env.NODE_ENV !== "production";

app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // OAuth Google + ressources cross-origin
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Prod : Vite bundle tout en .js statiques (pas d'inline/eval).
        // Dev : React Fast Refresh exige 'unsafe-eval', Vite injecte de l'inline.
        scriptSrc: isDev
          ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
          : ["'self'"],
        // 'unsafe-inline' obligatoire : shadcn/Radix injectent des style="" inline
        // (positionnement popovers/dropdowns/drawers). Google Fonts (CSS Nunito).
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        // Dev : WebSocket HMR Vite (/vite-hmr).
        connectSrc: isDev
          ? ["'self'", "ws://localhost:*", "wss://localhost:*"]
          : ["'self'"],
        frameSrc: ["'self'", "https://www.loom.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(isDev ? {} : { upgradeInsecureRequests: [] }),
      },
    },
  }),
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Body JSON : 2 Mo par défaut (images base64 : photo de profil, logo facture via
// PATCH /api/profile ; le défaut Express de 100 Ko renvoyait un 413 dès ~70 Ko).
// Exception : l'upload de supports de cours de l'assistant accepte jusqu'à 30 Mo
// (PDF de cours jusqu'à ~20 Mo + overhead base64). Limite haute confinée à cette
// seule route pour ne pas élargir la surface d'attaque ailleurs.
const jsonSmall = express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});
const jsonLarge = express.json({
  limit: "30mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/api/admin/assistant/documents") {
    return jsonLarge(req, res, next);
  }
  return jsonSmall(req, res, next);
});

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Log d'accès : méthode, chemin, statut, durée. JAMAIS le corps de la réponse.
// Historiquement ce middleware concaténait `JSON.stringify(body)` : les tokens de
// session (renvoyés par /api/auth/login et /register), les données de santé des
// clients (allergies, antécédents, anamnèses) et l'export RGPD complet finissaient
// en clair dans les logs serveur.
//
// Le chemin est expurgé au passage : plusieurs routes publiques portent leur token
// DANS l'URL (/api/rdv/confirm/:token, /api/public/manage/:token, /api/public/
// anamnese/:token). Les journaliser reviendrait à publier de quoi annuler un rendez-
// vous ou lire une anamnèse. On masque tout segment qui ressemble à un token hex
// (genToken = 48 chars, randomBytes(16|32) = 32|64) plutôt que d'entretenir une
// liste de routes qui se désynchroniserait.
const redactPathTokens = (p: string) => p.replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, "/:token");

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      log(`${req.method} ${redactPathTokens(path)} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });

  next();
});

(async () => {
  // Attendre les migrations MySQL best-effort (création des tables) AVANT de
  // seeder : sur une base MySQL vierge, le seed requête `natural_solutions` qui
  // n'existerait pas encore sans cette barrière. En SQLite, no-op instantané.
  await migrationsReady;
  await seedIfEmpty();
  await seedNaturalSolutions();
  await registerRoutes(httpServer, app);

  // Routes SEO (sitemap.xml, robots.txt, pré-rendu crawler /p/:slug) : enregistrées
  // ici, AVANT la bifurcation dev/prod ci-dessous, pour être disponibles dans les
  // deux environnements (setupVite ne les connaît pas — voir server/static.ts).
  registerSeoRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: process.platform === "linux",
    },
    () => {
      // Le PID permet de distinguer un REDÉMARRAGE (Passenger recycle le process quand
      // l'app est inactive — 4 à 5 fois par jour) d'un déploiement multi-workers. Deux
      // PID vivants en parallèle signifient que les verrous en mémoire
      // (serialiserParUser, utilisés par la numérotation de factures et la réservation)
      // ne couvrent qu'une partie du trafic.
      log(`serving on port ${port} (pid ${process.pid})`);
    },
  );
})();
