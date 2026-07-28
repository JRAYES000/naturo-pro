import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations-sqlite", // inutilisé : le dev applique le schéma via `db:push`
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data.db",
  },
});
