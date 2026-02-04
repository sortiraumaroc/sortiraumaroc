import { Router, type Request, type Response } from "express";

export const chatRouter = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  placeId: number;
  placeName: string;
  menu: any;
}

interface ChatResponseItem {
  id: string;
  title: string;
  price: string;
  image: string;
  description: string;
}

interface ChatResponse {
  type: "text" | "products";
  text: string;
  items?: ChatResponseItem[];
}

chatRouter.post("/chat", async (req: Request, res: Response) => {
  try {
    const { messages, placeId, placeName, menu } = req.body as ChatRequest;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    if (!placeName || !menu) {
      return res.status(400).json({ error: "placeName and menu are required" });
    }

    // Build the system prompt
    const systemPrompt = `
Règles d'accueil & de ton

Ton nom : SAM

Tu parles en "tu".

Style : professionnel, chaleureux, orienté client.

❌ Ne commence jamais par "Bonjour", "Salut", "Hey".

❌ Ne redémarre jamais la conversation comme si c'était la première fois, sauf au tout premier message.

Première interaction de la conversation

Si c'est le premier message de la conversation avec le client, commence par :

Tu es SAM, le conseiller virtuel du restaurant ${placeName}.

Ton rôle est d'aider le client à choisir ses plats, répondre aux questions liées au menu et gérer un panier de commande, comme le ferait un serveur professionnel et attentionné.

🧠 Cadre général (règles strictes)

Tu parles uniquement du restaurant et de sa carte

Tu ne sors jamais du sujet

Si une question ne concerne pas le menu, les prix, les plats, les ingrédients, les labels ou le panier, tu réponds exactement :

Je ne suis pas en mesure de répondre à cette question, mais je peux t'aider sur un plat, un prix, une suggestion ou ta commande.

Tu n'inventes jamais :

aucun plat

aucun ingrédient

aucun prix

aucune description

👉 Tu te bases UNIQUEMENT sur :

les plats réellement présents sur la carte

les catégories existantes

les labels disponibles

🗣️ Ton & posture

Tu parles en "tu"

Style : professionnel, chaleureux, orienté client

Tu parles comme un serveur en salle

Phrases courtes, claires, structurées

Tu vas droit au but

❌ Ne commence jamais par :

"Bonjour"

"Salut"

"Hey"

❌ Ne redémarre jamais la conversation comme si c'était la première fois (sauf à la toute première interaction)

👋 Première interaction de la conversation UNIQUEMENT

Si c'est le premier message du client, commence obligatoirement par :

Bienvenue au ${placeName}, je suis SAM.
Dis-moi ce que tu aimes (ou ce que tu n'aimes pas), ta faim et ton budget, et je te propose le meilleur du menu.

🍽️ Recommandations & logique de choix

Quand le client parle de :

ses goûts

ses envies

ses allergies

son budget

👉 Tu adaptes tes propositions exactement à sa demande :

S'il demande un plat précis → tu proposes dans cette catégorie

S'il a un budget confortable → tu peux proposer entrée + plat + dessert

Sinon → tu restes ciblé et pertinent

Chaque choix doit être :

réel

cohérent

justifié en 1 phrase

Justification possible :

goût

texture

équilibre

cohérence avec ses préférences

respect du budget

🏷️ Labels autorisés (uniquement s'ils existent sur la carte)

Tu peux utiliser les labels suivants :

⭐ Spécialité
🥇 Best seller
❤️ Coup de cœur
👨‍🍳 Suggestion du chef
🥗 Végétarien
🌶️ Épicé
🆕 Nouveauté

Si pertinent, tu peux aussi ajouter un univers :

🐟 Fruits de mer
🥗 Healthy
🇲🇦 Traditionnel
🇲🇦 Signature

🚫 Cas d'impossibilité de réponse

Si tu ne peux pas répondre à une demande (plat indisponible, info inexistante, question hors menu) :

Tu l'indiques clairement

Tu proposes immédiatement une alternative issue des labels disponibles

🧾 Format obligatoire des recommandations (interaction panier)

IMPORTANT : Quand tu recommandes des produits, tu DOIS toujours répondre en JSON STRICT (voir section "INSTRUCTIONS POUR LES RÉPONSES JSON" à la fin).

Pour chaque plat recommandé dans le JSON, inclus :
- id : l'ID exacte du produit du menu
- title : Nom du plat avec labels (exemple: "Cheese burger 🌶️ Épicé")
- price : le prix en Dhs
- image : l'URL complète de l'image du produit (EXACTEMENT comme dans le menu)
- description : justification courte (goût, texture, équilibre, cohérence avec les préférences)

🛒 Gestion du panier

Si le client dit ou clique "Ajouter au panier" :

Tu ajoutes le plat au panier interne

Tu rappelles clairement le contenu actuel du panier

Ta mémoire étant courte :

Tu rappelles l'essentiel du panier à chaque modification

Tu évites les longues discussions

Tu restes simple et lisible

🍰 Upsell intelligent (sans insister)

À la fin de la commande ou si pertinent :

Si le total est faible :

Avec quelques dirhams en plus, tu peux passer sur un menu plus complet, tu veux voir ?

Si aucun dessert n'est présent :

Tu veux finir avec un dessert ou un café ?

✅ Clôture obligatoire

À la fin de chaque réponse importante (recommandations ou modification du panier), termine toujours par :

👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?

MENU :
${JSON.stringify(menu, null, 2)}

🎯 QUAND UTILISER QUEL FORMAT DE RÉPONSE :

1️⃣ SI le client demande une recommandation, décrit un goût/budget/allergie, ou dit "propose-moi" :
   → TOUJOURS répondre avec le format "products" (JSON avec product cards)
   → Inclure un message de bienvenue ou contexte AVANT les produits
   → Inclure un message de clôture APRÈS les produits

2️⃣ SI le client pose une simple question factuelle sur le menu (prix, ingrédients, etc.) :
   → Répondre en "text" (simple texte) avec la réponse

3️⃣ SI le client dit "J'ai un budget de X Dhs" ou "J'aime [goût]" :
   → TOUJOURS utiliser le format "products" et recommander 2-4 plats

INSTRUCTIONS POUR LES RÉPONSES JSON :

💳 FORMAT "PRODUCTS" (pour recommandations de plats) :

🔴 CRITIQUE : RETOURNE UNIQUEMENT DU JSON RAW (SUR UNE SEULE LIGNE) !
- PAS de markdown code blocks (pas de \`\`\`json \`\`\`)
- PAS de backticks
- ZERO texte avant ou après le JSON - SEULEMENT l'objet JSON brut
- COMMENCER DIRECTEMENT PAR { et FINIR PAR }
- LE MESSAGE ET LA CLÔTURE DOIVENT ÊTRE DANS LE CHAMP "text" du JSON, PAS DEHORS
- LA RÉPONSE ENTIÈRE DOIT ÊTRE SUR UNE SEULE LIGNE (JSON minifié sans retours à la ligne)
- LES RETOURS À LA LIGNE DANS LE TEXTE DOIVENT ÊTRE REPRÉSENTÉS COMME "\n" (echappés)

⚠️ CHAMP OBLIGATOIRE : description DOIT ÊTRE INCLUS pour CHAQUE produit !

Exemple de structure (lisible) :
{
  "type": "products",
  "text": "Voici quelques plats que je te recommande :\n\n👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?",
  "items": [
    {
      "id": "prod_1",
      "title": "Plat A 🌶️",
      "price": "40 Dhs",
      "image": "https://example.com/image1.jpg",
      "description": "Léger, équilibré, bon rapport faim/budget"
    },
    {
      "id": "prod_2",
      "title": "Plat B ⭐",
      "price": "60 Dhs",
      "image": "https://example.com/image2.jpg",
      "description": "Ultra gourmand, idéal si tu veux te faire plaisir"
    }
  ]
}

TA RÉPONSE DOIT RESSEMBLER EXACTEMENT À CECI (sans aucun texte supplémentaire, 1 ligne) :
{"type":"products","text":"Voici quelques plats que je te recommande :\n\n👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?","items":[{"id":"prod_1","title":"Plat A 🌶️","price":"40 Dhs","image":"https://example.com/image1.jpg","description":"Léger, équilibré, bon rapport faim/budget"},{"id":"prod_2","title":"Plat B ⭐","price":"60 Dhs","image":"https://example.com/image2.jpg","description":"Ultra gourmand, idéal si tu veux te faire plaisir"}]}

📝 FORMAT "TEXT" (pour questions factuelles simples) :

MÊME RÈGLE : UNIQUEMENT DU JSON RAW, SANS markdown ET SANS TEXTE DEHORS !
{"type":"text","text":"ta réponse courte et claire au client\n\n👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?"}

⚠️ RÈGLES STRICTES :
- L'ID du produit doit EXACTEMENT matcher un ID du menu fourni
- Le titre doit correspondre au titre du menu (tu peux ajouter des labels à la fin)
- Le prix doit être EXACTEMENT comme dans le menu
- L'image URL doit être copiée EXACTEMENT depuis le menu fourni ci-dessus
- ⚠️⚠️⚠️ LA DESCRIPTION EST OBLIGATOIRE pour chaque produit - JAMAIS vide
- La description doit être une phrase courte (max 15 mots), JAMAIS inventer d'ingrédients
- Recommander 2-4 produits maximum par réponse (plus lisible)
- TOUS les champs DOIVENT ÊTRE PRÉSENTS : id, title, price, image, description (JAMAIS de champ manquant)
- LA CLÔTURE OBLIGATOIRE doit TOUJOURS être incluse à la fin du champ "text" : "👉 Souhaites-tu d'autres combinaisons, modifier ton panier ou finaliser ta commande ?"
    `.trim();

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API Error:", error);
      return res.status(response.status).json({ error: "Failed to get response from OpenAI" });
    }

    const data = await response.json();
    let assistantMessage = data.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      return res.status(500).json({ error: "No response from OpenAI" });
    }

    console.log("📨 Raw OpenAI response (first 500 chars):", assistantMessage.substring(0, 500));

    // Extract and parse JSON from the response (may be surrounded by text or markdown)
    let cleanedMessage = assistantMessage.trim();

    // Step 1: Strip markdown code blocks if present (e.g., ```json { ... } ```)
    const mdStripped = cleanedMessage
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    // Step 2: Try to parse as JSON
    let parsed: any = null;

    // Try parsing the full cleaned message first
    try {
      parsed = JSON.parse(mdStripped);
      console.log("✅ Successfully parsed full message as JSON");
    } catch (e1) {
      console.log("❌ Full message not valid JSON, attempting extraction...");

      // If that fails, try to extract JSON object by matching braces
      const firstBrace = mdStripped.indexOf("{");
      if (firstBrace !== -1) {
        let braceCount = 0;
        let endBrace = -1;

        for (let i = firstBrace; i < mdStripped.length; i++) {
          const char = mdStripped[i];
          if (char === "{") braceCount++;
          else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              endBrace = i;
              break;
            }
          }
        }

        if (endBrace !== -1) {
          let jsonStr = mdStripped.substring(firstBrace, endBrace + 1);
          console.log("🔍 Extracted JSON substring (length:", jsonStr.length, ")");
          console.log("📦 JSON preview:", jsonStr.substring(0, 200));

          try {
            parsed = JSON.parse(jsonStr);
            console.log("✅ Successfully extracted and parsed JSON from mixed text");
          } catch (e2) {
            console.warn("⚠️ Found JSON pattern but failed to parse it initially");
            console.warn("❌ Parse error:", (e2 as Error).message);

            // Try to fix unescaped newlines and control characters
            try {
              console.log("🔧 Attempting to fix unescaped control characters in JSON...");
              const fixedJson = jsonStr.replace(/"([^"\\]|\\.)*"/g, (match) => {
                return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
              });

              parsed = JSON.parse(fixedJson);
              console.log("✅ Successfully parsed JSON after fixing control characters");
            } catch (e3) {
              console.warn("⚠️ Still failed to parse even after fixing");
              console.warn("📝 JSON attempted to parse had length:", jsonStr.length);
            }
          }
        } else {
          console.warn("⚠️ Found opening brace but no matching closing brace");
        }
      } else {
        console.warn("⚠️ No JSON object found in response");
      }
    }

    // Step 3: Build the response
    let result: ChatResponse;
    if (parsed && typeof parsed === "object") {
      try {
        console.log("📝 Processing parsed response:", { type: parsed.type, hasItems: !!parsed.items });

        // Validate products response
        if (parsed.type === "products" && Array.isArray(parsed.items) && parsed.items.length > 0) {
          // Validate each item has required fields (non-empty strings)
          const validItems = parsed.items.filter((item: any) =>
            item.id && String(item.id).trim() &&
            item.title && String(item.title).trim() &&
            item.price && String(item.price).trim() &&
            item.image && String(item.image).trim() &&
            item.description && String(item.description).trim()
          );

          console.log(`📊 Found ${parsed.items.length} items, ${validItems.length} are valid`);

          if (validItems.length > 0) {
            result = {
              type: "products",
              text: parsed.text || "Voici mes recommandations :",
              items: validItems.map((item: any) => ({
                id: String(item.id),
                title: String(item.title),
                price: String(item.price),
                image: String(item.image),
                description: String(item.description),
              })),
            };
            console.log("✅ Returning products response with", validItems.length, "items");
          } else {
            // Items don't have required fields, treat as text
            // Extract the text message from the JSON if available
            console.warn("⚠️ Items missing required fields, returning as text");
            result = {
              type: "text",
              text: parsed.text || assistantMessage,
            };
          }
        } else if (parsed.type === "text") {
          result = {
            type: "text",
            text: parsed.text || assistantMessage,
          };
        } else {
          // Unknown type or structure
          // Try to extract text field if available
          result = {
            type: "text",
            text: parsed.text || assistantMessage,
          };
        }
      } catch (error) {
        console.error("Error processing parsed JSON:", error);
        // Try to extract text field from parsed JSON if available
        result = {
          type: "text",
          text: parsed?.text || assistantMessage,
        };
      }
    } else {
      // Not valid JSON at top level, might have text + embedded JSON
      console.warn("⚠️ Could not parse response as JSON, checking for embedded JSON...");

      // Try one more time: look for embedded JSON in the full message
      const firstBrace = assistantMessage.indexOf("{");
      if (firstBrace !== -1 && firstBrace > 0) {
        // There's text before the JSON, try to extract just the JSON part
        let braceCount = 0;
        let endBrace = -1;

        for (let i = firstBrace; i < assistantMessage.length; i++) {
          const char = assistantMessage[i];
          if (char === "{") braceCount++;
          else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              endBrace = i;
              break;
            }
          }
        }

        if (endBrace !== -1) {
          let embeddedJson = assistantMessage.substring(firstBrace, endBrace + 1);
          console.log("🔍 Found embedded JSON at position", firstBrace, "length:", embeddedJson.length);

          try {
            parsed = JSON.parse(embeddedJson);
            console.log("✅ Successfully parsed embedded JSON from message");
            // Continue with the normal processing below
          } catch (e1) {
            console.warn("⚠️ Embedded JSON failed to parse:", (e1 as Error).message);

            // Try to fix unescaped newlines and control characters
            try {
              console.log("🔧 Attempting to fix unescaped control characters...");
              // Replace literal newlines, tabs, etc. inside string values with escaped versions
              const fixedJson = embeddedJson.replace(/"([^"\\]|\\.)*"/g, (match) => {
                return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
              });

              parsed = JSON.parse(fixedJson);
              console.log("✅ Successfully parsed fixed embedded JSON");
            } catch (e2) {
              console.warn("⚠️ Even after fixing, JSON failed to parse:", (e2 as Error).message);
              // Will return as text
            }
          }
        }
      }

      // If we successfully parsed the embedded JSON, process it
      if (parsed && typeof parsed === "object") {
        try {
          console.log("📝 Processing embedded JSON response:", { type: parsed.type, hasItems: !!parsed.items });

          if (parsed.type === "products" && Array.isArray(parsed.items) && parsed.items.length > 0) {
            const validItems = parsed.items.filter((item: any) =>
              item.id && String(item.id).trim() &&
              item.title && String(item.title).trim() &&
              item.price && String(item.price).trim() &&
              item.image && String(item.image).trim() &&
              item.description && String(item.description).trim()
            );

            if (validItems.length > 0) {
              result = {
                type: "products",
                text: parsed.text || "Voici mes recommandations :",
                items: validItems.map((item: any) => ({
                  id: String(item.id),
                  title: String(item.title),
                  price: String(item.price),
                  image: String(item.image),
                  description: String(item.description),
                })),
              };
              console.log("✅ Returning products response with", validItems.length, "items");
              res.json(result);
              return;
            }
          }
        } catch (error) {
          console.error("Error processing embedded JSON:", error);
        }
      }

      // If we couldn't extract/parse JSON, return as text
      result = {
        type: "text",
        text: assistantMessage,
      };
    }

    res.json(result);
  } catch (error) {
    console.error("Chat endpoint error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
