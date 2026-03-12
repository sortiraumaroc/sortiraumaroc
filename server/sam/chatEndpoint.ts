/**
 * Sam AI Assistant — Endpoint SSE /api/sam/chat
 *
 * Gère le streaming des réponses GPT-4o-mini avec function calling.
 * Sauvegarde les messages dans Supabase (async, best-effort).
 */

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { SAM_CONFIG } from "./config";
import { classifyMessage, getOffTopicResponse } from "./messageClassifier";
import { checkAbuse, recordAbuse } from "./abuseTracker";

const log = createModuleLogger("samChat");
import { buildSystemPrompt, buildProSystemPrompt, buildAdminSystemPrompt } from "./systemPrompt";
import { SAM_TOOLS, executeTool, getToolsForMode, type ToolContext } from "./tools";
import {
  getUserProfile,
  getEstablishmentDetails,
  getEstablishmentPacks,
  getEstablishmentReviews,
  getEstablishmentMenu,
} from "../lib/samDataAccess";
import { samChatRateLimiter } from "../middleware/rateLimiter";

// ---------------------------------------------------------------------------
// OpenAI client (lazy init)
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ---------------------------------------------------------------------------
// Auth helper — extrait userId du Bearer token Supabase
// ---------------------------------------------------------------------------

async function getUserIdFromToken(
  authHeader: string | undefined,
): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return null;

  try {
    const supabase = getAdminSupabase();
    // Vérifier le JWT via Supabase auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch { /* intentional: auth token may be invalid */
    return null;
  }
}

// ---------------------------------------------------------------------------
// Conversation management
// ---------------------------------------------------------------------------

async function getOrCreateConversation(params: {
  conversationId?: string;
  sessionId: string;
  userId: string | null;
}): Promise<{ id: string; messages: ChatCompletionMessageParam[] }> {
  const supabase = getAdminSupabase();

  // Si conversationId fourni, charger l'historique
  if (params.conversationId) {
    const { data: conv } = await supabase
      .from("sam_conversations")
      .select("id,user_id,message_count")
      .eq("id", params.conversationId)
      .maybeSingle();

    if (conv) {
      // Vérifier limite de messages
      if (
        (conv as any).message_count >= SAM_CONFIG.maxMessagesPerConversation
      ) {
        // Forcer nouvelle conversation
        return createNewConversation(params.sessionId, params.userId);
      }

      // Charger les N derniers messages pour le contexte
      const { data: msgRows } = await supabase
        .from("sam_messages")
        .select("role,content,tool_calls,tool_call_id,tool_name")
        .eq("conversation_id", params.conversationId)
        .order("created_at", { ascending: true })
        .limit(SAM_CONFIG.maxConversationContext);

      const messages: ChatCompletionMessageParam[] = ((msgRows ?? []) as any[])
        .map(rowToMessage)
        .filter(Boolean) as ChatCompletionMessageParam[];

      return { id: params.conversationId, messages };
    }
  }

  // Sinon, chercher une conversation récente pour cette session
  const { data: recent } = await supabase
    .from("sam_conversations")
    .select("id,message_count")
    .eq("session_id", params.sessionId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    recent &&
    (recent as any).message_count < SAM_CONFIG.maxMessagesPerConversation
  ) {
    const { data: msgRows } = await supabase
      .from("sam_messages")
      .select("role,content,tool_calls,tool_call_id,tool_name")
      .eq("conversation_id", (recent as any).id)
      .order("created_at", { ascending: true })
      .limit(SAM_CONFIG.maxConversationContext);

    const messages: ChatCompletionMessageParam[] = ((msgRows ?? []) as any[])
      .map(rowToMessage)
      .filter(Boolean) as ChatCompletionMessageParam[];

    return { id: (recent as any).id, messages };
  }

  return createNewConversation(params.sessionId, params.userId);
}

async function createNewConversation(
  sessionId: string,
  userId: string | null,
): Promise<{ id: string; messages: ChatCompletionMessageParam[] }> {
  const supabase = getAdminSupabase();

  const { data: conv } = await supabase
    .from("sam_conversations")
    .insert({
      session_id: sessionId,
      user_id: userId,
      message_count: 0,
    })
    .select("id")
    .single();

  return { id: (conv as any).id, messages: [] };
}

function rowToMessage(
  row: any,
): ChatCompletionMessageParam | null {
  if (row.role === "user") {
    return { role: "user", content: row.content ?? "" };
  }
  if (row.role === "assistant") {
    const msg: any = { role: "assistant", content: row.content ?? "" };
    if (row.tool_calls) {
      msg.tool_calls = row.tool_calls;
      // Quand il y a des tool_calls, content peut être null
      if (!row.content) msg.content = null;
    }
    return msg;
  }
  if (row.role === "tool") {
    return {
      role: "tool",
      content: row.content ?? "",
      tool_call_id: row.tool_call_id ?? "",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sauvegarde async (best-effort)
// ---------------------------------------------------------------------------

function saveMessage(
  conversationId: string,
  msg: {
    role: string;
    content?: string | null;
    tool_calls?: unknown;
    tool_call_id?: string;
    tool_name?: string;
    tokens_input?: number;
    tokens_output?: number;
    latency_ms?: number;
  },
): void {
  const supabase = getAdminSupabase();

  void (async () => {
    try {
      await supabase.from("sam_messages").insert({
        conversation_id: conversationId,
        role: msg.role,
        content: msg.content ?? null,
        tool_calls: msg.tool_calls ?? null,
        tool_call_id: msg.tool_call_id ?? null,
        tool_name: msg.tool_name ?? null,
        tokens_input: msg.tokens_input ?? null,
        tokens_output: msg.tokens_output ?? null,
        latency_ms: msg.latency_ms ?? null,
      });

      // Incrémenter message_count via SQL brut (pas de RPC dédiée)
      const { data: conv } = await supabase
        .from("sam_conversations")
        .select("message_count")
        .eq("id", conversationId)
        .maybeSingle();

      await supabase
        .from("sam_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          message_count: ((conv as any)?.message_count ?? 0) + 1,
        })
        .eq("id", conversationId);
    } catch (err) {
      log.warn({ err }, "sam saveMessage failed");
    }
  })();
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(res: Response, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// Establishment context loader (mode scoped)
// ---------------------------------------------------------------------------

export interface EstablishmentFullContext {
  establishment: Awaited<ReturnType<typeof getEstablishmentDetails>> extends infer T
    ? T extends null ? never : T
    : never;
  packs: Awaited<ReturnType<typeof getEstablishmentPacks>>;
  reviews: Awaited<ReturnType<typeof getEstablishmentReviews>>;
  menu: Awaited<ReturnType<typeof getEstablishmentMenu>>;
  ramadanOffers: Array<Record<string, unknown>>;
}

async function loadFullEstablishmentContext(
  ref: string,
): Promise<EstablishmentFullContext | null> {
  const [details, packs, reviews, menu] = await Promise.all([
    getEstablishmentDetails(ref),
    getEstablishmentPacks(ref).catch(() => ({ packs: [], total: 0 })),
    getEstablishmentReviews(ref, 5).catch(() => ({
      reviews: [],
      average_rating: null,
      total_count: 0,
    })),
    getEstablishmentMenu(ref).catch(() => null),
  ]);

  if (!details) return null;

  // Charger offres Ramadan si existantes
  let ramadanOffers: Array<Record<string, unknown>> = [];
  try {
    const supabase = getAdminSupabase();
    const { data } = await supabase
      .from("ramadan_offers")
      .select(
        "id,title,type,price,original_price,time_slots,capacity_per_slot,description,conditions,valid_from,valid_to",
      )
      .eq("establishment_id", details.establishment.id)
      .eq("is_active", true);
    ramadanOffers = (data ?? []) as Array<Record<string, unknown>>;
  } catch { /* intentional: ramadan table may not exist */
  }

  return {
    establishment: details,
    packs,
    reviews,
    menu,
    ramadanOffers,
  };
}

// ---------------------------------------------------------------------------
// Context reduction — résumé des anciens messages (F10)
// ---------------------------------------------------------------------------

/**
 * Génère (ou récupère du cache) un résumé des anciens messages de la conversation.
 * Retourne null si la conversation est assez courte (≤ maxRecentMessages).
 */
async function getOrGenerateContextSummary(
  conversationId: string,
  messages: ChatCompletionMessageParam[],
): Promise<string | null> {
  if (messages.length <= SAM_CONFIG.maxRecentMessages) return null;

  const supabase = getAdminSupabase();

  // Vérifier le cache dans conversation metadata
  try {
    const { data: conv } = await supabase
      .from("sam_conversations")
      .select("metadata")
      .eq("id", conversationId)
      .maybeSingle();

    const metadata = (conv?.metadata as Record<string, unknown>) ?? {};
    const cached = metadata.context_summary as
      | { text: string; at_count: number }
      | undefined;

    // Réutiliser le cache si encore valide (couvre assez de l'historique)
    if (cached?.text && cached.at_count >= messages.length - SAM_CONFIG.maxRecentMessages - 4) {
      return cached.text;
    }

    // Extraire les anciens messages (avant les N récents) — seulement user + assistant avec contenu
    const olderMessages = messages.slice(0, -SAM_CONFIG.maxRecentMessages);
    const summaryInput = olderMessages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => `${m.role}: ${String(m.content ?? "").slice(0, 200)}`)
      .join("\n");

    if (!summaryInput.trim()) return null;

    // Générer le résumé via gpt-4o-mini (coût ~$0.0001)
    const openai = getOpenAI();
    const resp = await openai.chat.completions.create({
      model: SAM_CONFIG.modelSimple,
      messages: [
        {
          role: "system",
          content:
            "Résume cette conversation en 2-3 phrases en français. Garde les infos clés : ville cherchée, type de lieu, préférences exprimées, établissements mentionnés, décisions prises.",
        },
        { role: "user", content: summaryInput },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const summaryText = resp.choices[0]?.message?.content ?? null;

    // Cacher le résumé dans metadata (fire-and-forget)
    if (summaryText) {
      void supabase
        .from("sam_conversations")
        .update({
          metadata: {
            ...metadata,
            context_summary: { text: summaryText, at_count: messages.length },
          },
        })
        .eq("id", conversationId);
    }

    return summaryText;
  } catch (err) {
    log.warn({ err }, "Context summary generation failed — using full context");
    return null;
  }
}

/** Vérifie si le dernier message assistant de la conversation avait des tool_calls */
function lastAssistantUsedTools(messages: ChatCompletionMessageParam[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      return Array.isArray((m as any).tool_calls) && (m as any).tool_calls.length > 0;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main chat handler
// ---------------------------------------------------------------------------

async function handleSamChat(req: Request, res: Response): Promise<void> {
  // Vérifier que Sam est activé
  if (!SAM_CONFIG.enabled) {
    res.status(503).json({ error: "sam_disabled" });
    return;
  }

  const body = req.body ?? {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.session_id === "string" ? body.session_id.trim() : "";
  const conversationId =
    typeof body.conversation_id === "string"
      ? body.conversation_id.trim()
      : undefined;
  const universe =
    typeof body.universe === "string" ? body.universe.trim() : undefined;
  const establishmentId =
    typeof body.establishment_id === "string"
      ? body.establishment_id.trim()
      : undefined;
  const rawMode = typeof body.mode === "string" ? body.mode : "consumer";
  const mode = rawMode === "pro" || rawMode === "admin" ? rawMode : "consumer";

  if (!message) {
    res.status(400).json({ error: "empty_message" });
    return;
  }
  if (!sessionId) {
    res.status(400).json({ error: "missing_session_id" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "message_too_long" });
    return;
  }

  // Auth (optionnel)
  const userId = await getUserIdFromToken(req.headers.authorization);
  const isAuthenticated = userId != null;

  // Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx
  res.flushHeaders();

  const startTime = Date.now();

  try {
    // ── F11 : Vérification anti-abus ──
    const abuseCheck = await checkAbuse(sessionId);
    if (!abuseCheck.allowed) {
      sseEvent(res, { type: "text_delta", content: abuseCheck.message ?? "Sam est temporairement indisponible." });
      sseEvent(res, { type: "done", conversation_id: "", tokens: { input: 0, output: 0 } });
      res.end();
      return;
    }

    // Appliquer un délai artificiel si nécessaire (abus modéré)
    if (abuseCheck.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, abuseCheck.delayMs));
    }

    // Charger la conversation
    const conversation = await getOrCreateConversation({
      conversationId,
      sessionId,
      userId,
    });

    // ── F3 + F9 : Classification du message ──
    const hadTools = lastAssistantUsedTools(conversation.messages);
    const msgClass = classifyMessage(message, hadTools);

    // F3 : Interception off-topic (0 appel LLM)
    if (SAM_CONFIG.offTopicScreeningEnabled && msgClass === "off_topic") {
      // F11 : Enregistrer l'abus
      void recordAbuse(sessionId, "off_topic", message.slice(0, 100));

      let offTopicReply = getOffTopicResponse();

      // Ajouter l'avertissement si seuil atteint
      if (abuseCheck.warning) {
        offTopicReply += "\n\n⚠️ " + abuseCheck.warning;
      }

      // Sauvegarder les messages (analytics)
      saveMessage(conversation.id, { role: "user", content: message });
      saveMessage(conversation.id, { role: "assistant", content: offTopicReply });

      sseEvent(res, { type: "text_delta", content: offTopicReply });
      sseEvent(res, {
        type: "done",
        conversation_id: conversation.id,
        tokens: { input: 0, output: 0 },
      });
      res.end();
      return;
    }

    // Charger le profil utilisateur pour le contexte
    const userProfile = userId ? await getUserProfile(userId) : null;

    // Charger le contexte établissement si en mode scoped
    let establishmentContext: EstablishmentFullContext | null = null;
    if (establishmentId) {
      establishmentContext = await loadFullEstablishmentContext(establishmentId);
    }

    // Construire le system prompt selon le mode
    const systemPrompt =
      mode === "admin"
        ? buildAdminSystemPrompt()
        : mode === "pro"
          ? buildProSystemPrompt()
          : buildSystemPrompt({
              user: userProfile,
              isAuthenticated,
              universe,
              establishment: establishmentContext,
            });

    // Sélectionner les tools selon le mode (pro/admin = aucun tool)
    const tools = mode === "pro" || mode === "admin" ? undefined : getToolsForMode(establishmentId);

    // Sauvegarder le message utilisateur
    saveMessage(conversation.id, { role: "user", content: message });

    // ── F10 : Réduction du contexte (résumé + N derniers messages) ──
    const contextSummary = await getOrGenerateContextSummary(
      conversation.id,
      conversation.messages,
    );
    const recentMessages = contextSummary
      ? conversation.messages.slice(-SAM_CONFIG.maxRecentMessages)
      : conversation.messages;

    // Construire les messages pour GPT
    const gptMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(contextSummary
        ? [{ role: "system" as const, content: `Résumé de la conversation précédente :\n${contextSummary}` }]
        : []),
      ...recentMessages,
      { role: "user", content: message },
    ];

    const toolContext: ToolContext = { userId, isAuthenticated, conversationId: conversation.id };

    // Boucle de conversation (tool calls peuvent nécessiter plusieurs tours)
    let maxRounds = 5; // Sécurité anti-boucle infinie
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (maxRounds > 0) {
      maxRounds--;

      // ── F9 : Routage adaptatif du modèle ──
      const useSimpleModel =
        SAM_CONFIG.adaptiveRoutingEnabled &&
        msgClass === "simple" &&
        mode === "consumer";

      const selectedModel = useSimpleModel ? SAM_CONFIG.modelSimple : SAM_CONFIG.model;
      const selectedMaxTokens = useSimpleModel ? SAM_CONFIG.maxTokensSimple : SAM_CONFIG.maxTokens;
      const selectedTemp = useSimpleModel ? SAM_CONFIG.temperatureSimple : SAM_CONFIG.temperature;
      // Pas de tools pour le modèle simple (économie de tokens + évite les tool calls involontaires)
      const effectiveTools = useSimpleModel ? undefined : tools;

      const openai = getOpenAI();
      const stream = await openai.chat.completions.create({
        model: selectedModel,
        messages: gptMessages,
        ...(effectiveTools ? { tools: effectiveTools, tool_choice: "auto" as const } : {}),
        stream: true,
        temperature: selectedTemp,
        max_tokens: selectedMaxTokens,
      });

      let assistantContent = "";
      let toolCalls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }> = [];
      let currentToolCallIndex = -1;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Streaming du texte
        if (delta.content) {
          assistantContent += delta.content;
          sseEvent(res, { type: "text_delta", content: delta.content });
        }

        // Accumulation des tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined && tc.index !== currentToolCallIndex) {
              currentToolCallIndex = tc.index;
              toolCalls.push({
                id: tc.id ?? "",
                type: "function",
                function: { name: "", arguments: "" },
              });
            }
            const current = toolCalls[toolCalls.length - 1];
            if (current) {
              if (tc.id) current.id = tc.id;
              if (tc.function?.name) current.function.name += tc.function.name;
              if (tc.function?.arguments)
                current.function.arguments += tc.function.arguments;
            }
          }
        }

        // Usage tokens
        if (chunk.usage) {
          totalInputTokens += chunk.usage.prompt_tokens ?? 0;
          totalOutputTokens += chunk.usage.completion_tokens ?? 0;
        }
      }

      // Si pas de tool calls, la réponse est complète
      if (toolCalls.length === 0) {
        // Sauvegarder la réponse assistant
        saveMessage(conversation.id, {
          role: "assistant",
          content: assistantContent,
          tokens_input: totalInputTokens,
          tokens_output: totalOutputTokens,
          latency_ms: Date.now() - startTime,
        });
        break;
      }

      // Exécuter les tool calls
      const assistantMsg: any = {
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCalls,
      };
      gptMessages.push(assistantMsg);

      // Sauvegarder le message assistant avec tool_calls
      saveMessage(conversation.id, {
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        let toolArgs: Record<string, unknown> = {};

        try {
          toolArgs = JSON.parse(tc.function.arguments || "{}");
        } catch { /* intentional: JSON parsing */
          toolArgs = {};
        }

        sseEvent(res, {
          type: "tool_call",
          name: toolName,
          args: toolArgs,
        });

        // Exécuter le tool
        const result = await executeTool(toolName, toolArgs, toolContext);

        // Envoyer le résultat au frontend
        sseEvent(res, {
          type: "tool_result",
          name: toolName,
          data: result.data,
        });

        // Si le résultat contient des établissements, envoyer un événement spécial
        if (result.hasEstablishments) {
          const rawEstablishments = (result.data as any)?.establishments;
          const singleEstablishment = (result.data as any)?.establishment;
          const items = Array.isArray(rawEstablishments)
            ? rawEstablishments
            : singleEstablishment
              ? [singleEstablishment]
              : [];
          log.info({ toolName, itemsCount: items.length }, "Tool has establishments");
          if (items.length) {
            sseEvent(res, { type: "establishments", items });
          } else {
            log.warn({ toolName }, "Tool claimed hasEstablishments but items array is empty");
          }
        }

        // Si auth requise
        if (result.authRequired) {
          sseEvent(res, { type: "auth_required" });
        }

        // Ajouter le résultat tool au contexte GPT
        const toolResultMsg: ChatCompletionMessageParam = {
          role: "tool",
          content: JSON.stringify(result.data),
          tool_call_id: tc.id,
        };
        gptMessages.push(toolResultMsg);

        // Sauvegarder le message tool
        saveMessage(conversation.id, {
          role: "tool",
          content: JSON.stringify(result.data),
          tool_call_id: tc.id,
          tool_name: toolName,
        });
      }

      // Continuer la boucle pour obtenir la réponse finale de GPT
      // après avoir fourni les résultats des tools
      toolCalls = [];
      currentToolCallIndex = -1;
      assistantContent = "";
    }

    // Événement de fin
    sseEvent(res, {
      type: "done",
      conversation_id: conversation.id,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    });
  } catch (err: any) {
    log.error({ err, status: err?.status, code: err?.code }, "sam chat error");

    // Essayer d'envoyer une erreur SSE si le stream est encore ouvert
    try {
      if (err?.status === 429) {
        sseEvent(res, {
          type: "error",
          message: "Sam est très sollicité en ce moment. Réessaye dans quelques secondes !",
          code: "rate_limited",
        });
      } else {
        sseEvent(res, {
          type: "error",
          message: "Oups, j'ai eu un petit souci technique. Réessaye dans un instant !",
          code: "internal_error",
        });
      }
    } catch { /* intentional: SSE stream already closed */ }
  } finally {
    res.end();
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerSamRoutes(app: Express): void {
  app.post("/api/sam/chat", samChatRateLimiter, handleSamChat);

  // Health check
  app.get("/api/sam/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      enabled: SAM_CONFIG.enabled,
      model: SAM_CONFIG.model,
    });
  });
}
