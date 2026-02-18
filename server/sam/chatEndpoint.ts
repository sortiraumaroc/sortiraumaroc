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
import { SAM_CONFIG } from "./config";
import { buildSystemPrompt } from "./systemPrompt";
import { SAM_TOOLS, executeTool, type ToolContext } from "./tools";
import { getUserProfile } from "../lib/samDataAccess";
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
  } catch {
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
      console.error("[Sam] saveMessage error:", err);
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
    // Charger la conversation
    const conversation = await getOrCreateConversation({
      conversationId,
      sessionId,
      userId,
    });

    // Charger le profil utilisateur pour le contexte
    const userProfile = userId ? await getUserProfile(userId) : null;

    // Construire le system prompt
    const systemPrompt = buildSystemPrompt({
      user: userProfile,
      isAuthenticated,
      universe,
    });

    // Sauvegarder le message utilisateur
    saveMessage(conversation.id, { role: "user", content: message });

    // Construire les messages pour GPT
    const gptMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversation.messages,
      { role: "user", content: message },
    ];

    const toolContext: ToolContext = { userId, isAuthenticated, conversationId: conversation.id };

    // Boucle de conversation (tool calls peuvent nécessiter plusieurs tours)
    let maxRounds = 5; // Sécurité anti-boucle infinie
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (maxRounds > 0) {
      maxRounds--;

      const openai = getOpenAI();
      const stream = await openai.chat.completions.create({
        model: SAM_CONFIG.model,
        messages: gptMessages,
        tools: SAM_TOOLS,
        tool_choice: "auto",
        stream: true,
        temperature: SAM_CONFIG.temperature,
        max_tokens: SAM_CONFIG.maxTokens,
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
        } catch {
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
          console.log(`[Sam] Tool ${toolName} hasEstablishments=true, items.length=${items.length}`);
          if (items.length) {
            sseEvent(res, { type: "establishments", items });
          } else {
            console.warn(`[Sam] Tool ${toolName} claimed hasEstablishments but items array is empty`);
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
    console.error("[Sam] chat error:", err?.status, err?.message, err?.code);

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
    } catch {
      // Stream déjà fermé
    }
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
