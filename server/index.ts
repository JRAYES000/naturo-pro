import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import helmet from "helmet";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { seedIfEmpty } from "./seed";
import { seedNaturalSolutions } from "./solutions-seed";

const app = express();
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
        frameSrc: ["'none'"],
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

app.use(
  express.json({
    // 2 Mo : couvre les images en base64 (photo de profil, logo facture) envoyées
    // via PATCH /api/profile. Le défaut Express (100 Ko) renvoyait un 413 dès
    // qu'une image dépassait ~70 Ko — bug latent sur l'upload de logo.
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await seedIfEmpty();
  await seedNaturalSolutions();
  await registerRoutes(httpServer, app);

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
      log(`serving on port ${port}`);
    },
  );
})();
