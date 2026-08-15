import type { Express } from 'express';
import { createServer as createViteServer, createLogger } from "vite";
import type { Server } from 'node:http';
import viteConfig from "../vite.config";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { applySeoHead, applySeoBody, isSpaPath } from "./static";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      // /p/:slug (server/static.ts) a déjà résolu le head SEO du praticien et l'a
      // déposé dans res.locals — on l'injecte ici, AVANT transformIndexHtml, pour
      // que le HTML final ait à la fois le head SEO et le runtime Vite/React
      // Refresh (sans lequel React ne se monte pas en dev).
      if (res.locals.seoHead) {
        template = applySeoHead(template, res.locals.seoHead);
      }
      // Corps pré-rendu de /p/:slug (A1), même mécanisme que le head.
      if (res.locals.seoBody) {
        template = applySeoBody(template, res.locals.seoBody);
      }
      const page = await vite.transformIndexHtml(url, template);
      // Même règle qu'en prod (A3) : une URL inconnue répond 404, pas 200. Sans ça
      // le comportement dev et prod divergeraient précisément sur le point que
      // l'audit a relevé, et le test ne vaudrait rien en local.
      const status = res.locals.seoHead || isSpaPath(req.originalUrl) ? 200 : 404;
      res.status(status).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
