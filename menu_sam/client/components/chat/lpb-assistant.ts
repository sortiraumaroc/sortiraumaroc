import type { MenuCategory, MenuProduct } from "@/lib/menu-data";

export function getLpbSystemPrompt(placeName: string) {
  return `Tu es SAM, le conseiller virtuel du restaurant ${placeName}.
Tu aides le client à choisir ses plats et à gérer un panier de commande.

Ta mémoire de conversation est courte, donc tu dois :

- toujours rester clair, simple et structuré
- rappeler l'essentiel du panier dès qu'il change
- éviter les longues discussions et aller à l'essentiel

1️⃣ Règles d'accueil & de ton

Ton nom : SAM
Tu parles en "tu".
Style : professionnel, chaleureux, orienté client.

❌ Ne commence jamais par "Bonjour", "Salut", "Hey".
❌ Ne redémarre jamais la conversation comme si c'était la première fois, sauf au tout premier message.

Première interaction de la conversation

Si c'est le premier message de la conversation avec le client, commence par :

Bienvenue au ${placeName}, je suis SAM. Dis-moi ce que tu aimes (ou ce que tu n'aimes pas), ta faim et ton budget, et je te propose le meilleur du menu.

Interactions suivantes dans la même conversation

Pour les messages suivants :

Je suis là si tu veux un conseil, un plat rapide, ou même juste un café ou un dessert pour finir en douceur.

2️⃣ Base de travail : carte du restaurant

Tu dois te baser UNIQUEMENT sur les catégories suivantes :

Nos menus – Salades – Sandwichs – Poulets – Escalopes – Plats – Accompagnements – Desserts – Boissons – Cocktails

❌ Tu n'inventes aucun plat, aucun ingrédient, aucune description.
✔️ Tu ne proposes que des éléments réellement présents sur la carte.

3️⃣ Mission principale de SAM

Quand le client parle de ses goûts, envies, allergies ou budget :

- Entrées : proposer 1 à 3 suggestions (uniquement si le client en veut).
- Plats principaux : proposer 2 plats principaux alignés avec ses goûts et son budget.
- Dessert : proposer 1 dessert optionnel.

Justifier chaque choix en 1 phrase (goût, texture, cohérence avec ses préférences, budget).

Toujours proposer :

💸 1 option économique
⭐ 1 option plus premium

Si c'est pertinent selon ce qu'il t'a dit, signaler si un plat contient :

crème, fromage, piment, poisson, fruits secs.

4️⃣ Labels à mettre en avant

Si un plat possède l'un de ces labels, affiche-le après le nom :

⭐ Spécialité
🥇 Best seller
❤️ Coup de cœur
👨‍🍳 Suggestion du chef
🥗 Végétarien
🌶️ Épicé
🆕 Nouveauté

Et si le plat correspond à un univers particulier, tu peux ajouter :

🐟 Fruits de mer
🥗 Healthy
🇲🇦 Traditionnel
🇲🇦 Signature

5️⃣ Présentation des plats + interaction panier

Pour chaque plat recommandé, utilise ce format :

Nom du plat + labels — justification courte
➡️ [Ajouter au panier]

6️⃣ Gestion du panier (mémoire courte)

À chaque fois que le panier change (ajout, retrait, modification de quantité), tu dois toujours :

- recalculer le total
- réafficher le récapitulatif (liste des articles + total), de façon simple et courte

8️⃣ Style & clôture

Phrases courtes, structurées, faciles à lire.
Pas de répétition du prompt, pas de technique dans les réponses.

À la fin de chaque réponse importante (recommandations ou modification du panier), termine par :

👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?`;
}

export const LPB_SYSTEM_PROMPT = getLpbSystemPrompt("Restaurant");

export type AssistantContext = {
  categories: MenuCategory[];
  products: MenuProduct[];
};

type AssistantReplyOptions = {
  isFirstUserMessage: boolean;
  placeName?: string;
};

type ParsedRequest = {
  wantsStarter: boolean;
  wantsDrink: boolean;
  maxBudgetDh: number | null;
  avoid: {
    cream: boolean;
    cheese: boolean;
    spicy: boolean;
    seafood: boolean;
    nuts: boolean;
  };
  preferenceKeywords: string[];
};

export function getLpbFirstTimeIntro(placeName: string) {
  return `Bienvenue au ${placeName}, je suis SAM.\nDis-moi ce que tu aimes (ou ce que tu n'aimes pas), ta faim et ton budget, et je te propose le meilleur du menu.`;
}

export const LPB_FIRST_TIME_INTRO = getLpbFirstTimeIntro("Restaurant");

export const LPB_RETURNING_LINE =
  "Je suis là si tu veux un conseil, un plat rapide, ou même juste un café ou un dessert pour finir en douceur.";

const ENDING_LINE = "👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?";

function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function extractBudgetDh(text: string): number | null {
  const t = normalize(text);
  const m = t.match(/(\d{2,4})\s*(dh|dhs|mad)?/);
  if (!m) return null;
  const value = Number.parseInt(m[1] ?? "", 10);
  if (!Number.isFinite(value)) return null;
  if (value < 10 || value > 2000) return null;
  return value;
}

function parseRequest(message: string): ParsedRequest {
  const t = normalize(message);

  const wantsStarter = /(entree|starter|avant|pour commencer)/.test(t);
  const wantsDrink = /(boisson|soda|jus|eau|the|cafe)/.test(t);

  const avoidCream = /(sans creme|pas de creme|allergie.*creme)/.test(t);
  const avoidCheese = /(sans fromage|pas de fromage|allergie.*fromage)/.test(t);
  const avoidSpicy = /(sans piment|pas epice|pas de piment|non epice)/.test(t);
  const avoidSeafood = /(sans poisson|sans fruits de mer|pas de poisson|pas de fruits de mer)/.test(t);
  const avoidNuts = /(sans noix|sans amandes|sans fruits secs|allergie.*noix|allergie.*amande)/.test(t);

  const maxBudgetDh = extractBudgetDh(t);

  const preferenceKeywords: string[] = [];
  if (/(poulet|braise)/.test(t)) preferenceKeywords.push("poulet");
  if (/(sandwich|wrap|burger)/.test(t)) preferenceKeywords.push("sandwich");
  if (/(salade|healthy|leger|light)/.test(t)) preferenceKeywords.push("salade");
  if (/(menu|family|etudiant|enfant)/.test(t)) preferenceKeywords.push("menu");
  if (/(escalope|cordon|chevre|champignon)/.test(t)) preferenceKeywords.push("escalope");
  if (/(dessert|sucre|tiramisu|fondant)/.test(t)) preferenceKeywords.push("dessert");
  if (/(cocktail|mojito|marrakech|irresistible)/.test(t)) preferenceKeywords.push("cocktail");
  if (/(pates|pasta|tagliatelle|penne|carbonara|riz cremeux|sauce tomate)/.test(t)) preferenceKeywords.push("plat");

  return {
    wantsStarter,
    wantsDrink,
    maxBudgetDh,
    avoid: {
      cream: avoidCream,
      cheese: avoidCheese,
      spicy: avoidSpicy,
      seafood: avoidSeafood,
      nuts: avoidNuts,
    },
    preferenceKeywords,
  };
}

function productText(p: MenuProduct) {
  return normalize(`${p.title} ${p.description}`);
}

function detectWarnings(p: MenuProduct): string[] {
  const t = productText(p);
  const warnings: string[] = [];

  if (/creme/.test(t)) warnings.push("crème");
  if (/fromage/.test(t)) warnings.push("fromage");
  if (/piment|epice/.test(t) || (p.badges ?? []).includes("epice")) warnings.push("piment/épicé");
  if (/poisson|fruits de mer/.test(t) || (p.badges ?? []).includes("fruitsDeMer")) warnings.push("poisson/fruits de mer");
  if (/noix|amande|fruits secs/.test(t)) warnings.push("fruits secs");

  return warnings;
}

function labelsForProduct(p: MenuProduct) {
  const b = new Set(p.badges ?? []);
  const labels: string[] = [];

  if (b.has("specialite")) labels.push("⭐ Spécialité");
  if (b.has("bestSeller")) labels.push("🥇 Best seller");
  if (b.has("coupDeCoeur")) labels.push("❤️ Coup de cœur");
  if (b.has("chef")) labels.push("👨‍🍳 Suggestion du chef");
  if (b.has("vegetarien")) labels.push("🥗 Végétarien");
  if (b.has("epice")) labels.push("🌶️ Épicé");
  if (b.has("nouveau")) labels.push("🆕 Nouveauté");

  if (b.has("fruitsDeMer")) labels.push("🐟 Fruits de mer");
  if (b.has("healthy")) labels.push("🥗 Healthy");
  if (b.has("traditionnel")) labels.push("🇲🇦 Traditionnel");
  if (b.has("signature")) labels.push("🇲🇦 Signature");

  return labels.length > 0 ? ` ${labels.join(" ")}` : "";
}

function formatRecommendedProduct(p: MenuProduct, note: string) {
  const labels = labelsForProduct(p);
  const warnings = detectWarnings(p);
  const warnText = warnings.length > 0 ? ` — ⚠️ ${warnings.join(", ")}` : "";

  return [
    `${p.title}${labels} — ${note} · ${p.priceDh} Dhs${warnText}`,
    `➡️ [Ajouter au panier](sam:add:${p.id})`,
  ].join("\n");
}

function scoreProduct(p: MenuProduct, req: ParsedRequest): number {
  let score = 0;

  score += Math.min(50, p.likes);

  const t = productText(p);
  for (const kw of req.preferenceKeywords) {
    if (kw === "poulet" && /(poulet|braise|tenders|pilons|cuisse)/.test(t)) score += 25;
    if (kw === "sandwich" && /(sandwich|wrap|burger)/.test(t)) score += 20;
    if (kw === "salade" && /salade/.test(t)) score += 20;
    if (kw === "menu" && /menu/.test(t)) score += 20;
    if (kw === "escalope" && /(escalope|cordon|chevre|champignon)/.test(t)) score += 20;
    if (kw === "dessert" && /(tiramisu|fondant|dessert|sucre)/.test(t)) score += 15;
    if (kw === "cocktail" && /(cocktail|mojito|marrakech|irresistible)/.test(t)) score += 18;
    if (kw === "plat" && /(poulet a la creme|sauce tomate|sauce verte|carbonara|riz cremeux|pates|tagliatelle|penne)/.test(t)) score += 18;
  }

  if (req.avoid.cream && /creme/.test(t)) score -= 40;
  if (req.avoid.cheese && /fromage|chevre/.test(t)) score -= 40;
  if (req.avoid.spicy && (/piment|epice/.test(t) || (p.badges ?? []).includes("epice"))) score -= 30;
  if (req.avoid.seafood && (/poisson|fruits de mer/.test(t) || (p.badges ?? []).includes("fruitsDeMer"))) score -= 40;
  if (req.avoid.nuts && /noix|amande|fruits secs/.test(t)) score -= 40;

  if (req.maxBudgetDh !== null && p.priceDh > req.maxBudgetDh) score -= 25;

  return score;
}

function withinBudget(products: MenuProduct[], maxBudgetDh: number | null) {
  if (maxBudgetDh === null) return products;
  const filtered = products.filter((p) => p.priceDh <= maxBudgetDh);
  return filtered.length > 0 ? filtered : products;
}

function pickBestScored(products: MenuProduct[], req: ParsedRequest, count: number) {
  return [...products]
    .sort((a, b) => scoreProduct(b, req) - scoreProduct(a, req))
    .slice(0, count);
}

function pickEconomyAndPremium(products: MenuProduct[], req: ParsedRequest) {
  const scored = pickBestScored(products, req, 12);
  if (scored.length === 0) return { economy: null as MenuProduct | null, premium: null as MenuProduct | null };

  const sortedByPrice = [...scored].sort((a, b) => a.priceDh - b.priceDh);
  const economy = sortedByPrice[0] ?? null;
  const premium = sortedByPrice[sortedByPrice.length - 1] ?? null;

  if (economy && premium && economy.id === premium.id) {
    const alt = sortedByPrice[1] ?? null;
    return { economy, premium: alt };
  }

  return { economy, premium };
}

export function generateLpbAssistantReply(
  userMessage: string,
  ctx: AssistantContext,
  options: AssistantReplyOptions,
): string {
  const req = parseRequest(userMessage);

  const productsByCategory = new Map<string, MenuProduct[]>();
  for (const p of ctx.products) {
    const arr = productsByCategory.get(p.categoryId) ?? [];
    arr.push(p);
    productsByCategory.set(p.categoryId, arr);
  }

  const startersPool = withinBudget(productsByCategory.get("salades") ?? [], req.maxBudgetDh);

  const mainsPool = withinBudget(
    [
      ...(productsByCategory.get("poulets") ?? []),
      ...(productsByCategory.get("escalopes") ?? []),
      ...(productsByCategory.get("sandwichs") ?? []),
      ...(productsByCategory.get("menus") ?? []),
      ...(productsByCategory.get("plats") ?? []),
      ...(productsByCategory.get("salades") ?? []),
    ],
    req.maxBudgetDh,
  );

  const dessertsPool = withinBudget(productsByCategory.get("desserts") ?? [], req.maxBudgetDh);
  const drinksPool = withinBudget(
    [...(productsByCategory.get("boissons") ?? []), ...(productsByCategory.get("cocktails") ?? [])],
    req.maxBudgetDh,
  );

  const starters = req.wantsStarter ? pickBestScored(startersPool, req, 3) : [];
  const { economy, premium } = pickEconomyAndPremium(mainsPool, req);
  const dessert = pickBestScored(dessertsPool, req, 1)[0] ?? null;
  const drink =
    req.wantsDrink || req.preferenceKeywords.includes("cocktail")
      ? pickBestScored(drinksPool, req, 1)[0] ?? null
      : null;

  const lines: string[] = [];

  const placeName = options.placeName || "Restaurant";
  const firstTimeIntro = options.isFirstUserMessage ? getLpbFirstTimeIntro(placeName) : LPB_RETURNING_LINE;
  lines.push(firstTimeIntro);
  lines.push("");

  if (req.maxBudgetDh !== null) {
    lines.push(`Budget visé : ~${req.maxBudgetDh} Dhs`);
    lines.push("");
  }

  if (starters.length > 0) {
    lines.push("Entrées (si tu en veux) :");
    for (const p of starters) {
      lines.push(formatRecommendedProduct(p, "frais et léger pour bien démarrer"));
    }
    lines.push("");
  }

  lines.push("Plats principaux :");

  if (economy) {
    const t = productText(economy);
    const note = /salade/.test(t)
      ? "léger, équilibré, bon rapport faim/budget"
      : /sandwich|wrap|burger/.test(t)
        ? "rapide, pratique, bon rapport budget/plaisir"
        : /escalope|cordon/.test(t)
          ? "gourmand, texture fondante/croustillante"
          : "goût braisé, généreux, très apprécié";

    lines.push("💸 Option économique");
    lines.push(formatRecommendedProduct(economy, note));
  }

  if (premium) {
    const t = productText(premium);
    const note = /salade/.test(t)
      ? "plus travaillé, très cohérent si tu veux du léger premium"
      : /sandwich|wrap|burger/.test(t)
        ? "plus généreux, parfait quand tu as vraiment faim"
        : /escalope|cordon/.test(t)
          ? "ultra gourmand, idéal si tu veux te faire plaisir"
          : "belle pièce, option la plus généreuse";

    lines.push("");
    lines.push("⭐ Option plus premium");
    lines.push(formatRecommendedProduct(premium, note));
  }

  if (!economy && !premium) {
    lines.push("Je n'ai pas trouvé de plat principal correspondant pour le moment.");
  }

  lines.push("");
  lines.push("Dessert (optionnel) :");
  if (dessert) {
    lines.push(formatRecommendedProduct(dessert, "finir en douceur"));
  } else {
    lines.push("Je n'ai pas de dessert à te proposer pour l'instant.");
  }

  if (drink) {
    lines.push("");
    lines.push("Boisson / cocktail :");
    lines.push(formatRecommendedProduct(drink, "pour accompagner"));
  }

  lines.push("");
  lines.push(ENDING_LINE);

  return lines.join("\n").trim();
}
