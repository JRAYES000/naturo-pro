# Note — le modèle IA de Naturo Pro (action 25, 11/08/2026)

Objectif : aligner ce que croit le client sur ce que fait le code. Une page.

## Ce que le code appelle réellement

**Aucun appel direct à Mistral.** Tout le trafic IA passe par **OpenRouter** (une
seule clé, `OPENROUTER_API_KEY`) :

| Usage | Modèle | Où dans le code |
|---|---|---|
| Naturobot (chat), Studio contenu, titres/thèmes, génération de programme (action 15) | `deepseek/deepseek-v4-flash` | `server/mistral.ts` (`LLM_MODEL`), `server/social-content.ts` |
| Embeddings RAG (base de connaissances) | `mistralai/mistral-embed-2312` (1024 dim) | `server/rag.ts` (`EMBED_MODEL`) |

Le fichier s'appelle `mistral.ts` pour des raisons historiques (bascule vers
OpenRouter au commit a323ffc) ; seul l'ESPACE VECTORIEL des embeddings reste
celui de Mistral, routé lui aussi via OpenRouter.

## Coût au token (tarif OpenRouter relevé le 11/08/2026)

- `deepseek-v4-flash` : **0,14 $/M tokens en entrée, 0,28 $/M en sortie**
  (lecture de cache : 0,028 $/M).
- Mesuré sur 10 générations de programme réelles : ~1 000 tokens entrée,
  ~1 700 sortie → **≈ 0,0006 $ par génération**. Un message Naturobot type
  (system + RAG + historique ≈ 3 000 entrée, 800 sortie) ≈ 0,0007 $.
- Compte OpenRouter au 11/08/2026 : **3,61 $ consommés en cumulé** (depuis la
  mise en service), 70 $ de crédits disponibles.

## Qualité — grille de 5 critères binaires sur 10 sorties (action 15)

10 générations de programme (5 profils d'anamnèse × 2), notées sur : structure
(4-6 sections), densité (3-6 puces/section), sécurité (ni diagnostic ni
prescription), personnalisation (≥ 2 éléments de l'anamnèse repris),
exploitabilité (français, parsable). **Résultat : 10/10 — seuil de 7/10
franchi, fonctionnalité ouverte.** Sorties archivées hors dépôt (scratchpad de
session, eval-gen-1 à 10).

Défauts relevés (non bloquants) : posologies chiffrées parfois proposées dans
la section plantes/compléments — toujours avec garde-fous médicaux ; le prompt
interdit désormais explicitement les posologies chiffrées. Une sortie sur dix
a inventé un détail mineur absent de l'anamnèse : la relecture praticienne
avant envoi (statut brouillon systématique) reste la barrière prévue.

## Coût d'un changement de modèle

- **Modèle de chat/génération** : une constante à changer (`LLM_MODEL`),
  OpenRouter servant de façade multi-fournisseurs — puis re-passer la grille
  10 générations (seuil 7/10) et relever le nouveau tarif. ~1 h de travail.
- **Modèle d'embeddings** : changer `EMBED_MODEL` impose de **ré-embedder
  toute la base de connaissances** (`kb_chunks`) — les espaces vectoriels ne
  sont pas compatibles entre modèles. Script de ré-indexation + coût
  proportionnel au corpus. À n'envisager qu'avec une vraie raison.

## Quota (action 18, calibré)

`AI_DAILY_LIMIT = 100` messages ou générations/jour/praticienne (surchargable
par env). Pire cas : 3 000 appels/mois ≈ **1,8 €/praticienne** — marge ×2,7
sous le plafond de 5 €/mois par praticienne payante (décision 4). Appliqué
uniformément au Naturobot, au Studio et à la génération de programme
(`server/mistral.ts`, compteur `ai_chat_usage`).
