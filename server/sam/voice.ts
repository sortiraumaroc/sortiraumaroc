/**
 * Sam AI Assistant — Voice endpoints (STT + TTS)
 *
 * POST /api/sam/transcribe — Upload audio → Whisper → text
 * POST /api/sam/speak — Text → TTS → audio stream
 */

import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { Readable } from "node:stream";

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// STT — Whisper
// Accepts multipart/form-data with an "audio" file field
// Returns { text: string, language?: string }
async function handleTranscribe(req: Request, res: Response) {
  try {
    // Expect raw audio in body (binary)
    // The frontend sends audio as application/octet-stream or multipart
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: "No audio data received" });
    }
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ error: "Audio too large (max 25MB)" });
    }

    const openai = getOpenAI();

    // Create a File object from buffer for OpenAI
    const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: undefined, // auto-detect (supports fr, en, ar)
      response_format: "verbose_json",
    });

    res.json({
      text: transcription.text,
      language: (transcription as any).language ?? null,
      duration: (transcription as any).duration ?? null,
    });
  } catch (err: any) {
    console.error("[Sam Voice] transcribe error:", err?.message);
    res.status(500).json({ error: "Transcription failed" });
  }
}

// TTS — Text to Speech
// Accepts JSON { text: string, voice?: string }
// Returns audio/mpeg stream
async function handleSpeak(req: Request, res: Response) {
  try {
    const { text, voice } = req.body ?? {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text" });
    }
    if (text.length > 4096) {
      return res.status(400).json({ error: "Text too long (max 4096 chars)" });
    }

    const openai = getOpenAI();

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice ?? "nova", // nova = warm feminine voice
      input: text,
      response_format: "mp3",
      speed: 1.0,
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Transfer-Encoding", "chunked");

    // Stream the audio response
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const readable = Readable.from(buffer);
    readable.pipe(res);
  } catch (err: any) {
    console.error("[Sam Voice] speak error:", err?.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Speech synthesis failed" });
    }
  }
}

export function registerSamVoiceRoutes(app: Express): void {
  app.post("/api/sam/transcribe", handleTranscribe);
  app.post("/api/sam/speak", handleSpeak);
}
