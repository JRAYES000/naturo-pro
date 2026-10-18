/**
 * script/bdpm-refresh.ts — recharge la copie locale de la base publique des
 * médicaments (BDPM, ANSM) et vérifie une recherche. Usage : npm run bdpm:refresh
 * (en production, le cron quotidien s'en charge dès qu'elle date d'un mois).
 */
import { refreshBdpmIfStale } from "../server/bdpm";
import { storage } from "../server/storage";

const t0 = Date.now();
const r = await refreshBdpmIfStale(true);
console.log(`[bdpm] ${r.count} spécialités chargées en ${Math.round((Date.now() - t0) / 1000)} s`);
const doliprane = await storage.searchMedications(["doliprane"]);
console.log(`[bdpm] « doliprane » : ${doliprane.length} résultat(s), ex. ${doliprane[0]?.name ?? "aucun"}`);
process.exit(doliprane.length ? 0 : 1);
