/**
 * Sam AI Assistant — Voice hook
 *
 * Records audio via MediaRecorder API, sends to Whisper for transcription,
 * and plays TTS audio responses.
 */

import { useState, useRef, useCallback } from "react";

// Web Speech API type augmentation
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export type VoiceState = "idle" | "recording" | "transcribing" | "speaking";

export function useSamVoice(onTranscription: (text: string) => void) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check browser support
  const hasWebSpeechAPI = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasMediaRecorder = typeof window !== "undefined" && !!window.MediaRecorder;

  // --- Web Speech API (free, fast, good for French) ---
  const startWebSpeech = useCallback(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return false;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = "fr-FR"; // French by default
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0]?.[0]?.transcript ?? "";
        if (text.trim()) {
          onTranscription(text.trim());
        }
        setVoiceState("idle");
      };

      recognition.onerror = () => {
        setVoiceState("idle");
        // Fall back to Whisper on error
        return false;
      };

      recognition.onend = () => {
        setVoiceState("idle");
        recognitionRef.current = null;
      };

      recognition.start();
      recognitionRef.current = recognition;
      setVoiceState("recording");
      return true;
    } catch {
      return false;
    }
  }, [onTranscription]);

  // --- Whisper API (fallback, supports darija) ---
  const startWhisperRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size === 0) {
          setVoiceState("idle");
          return;
        }

        setVoiceState("transcribing");

        try {
          const response = await fetch("/api/sam/transcribe", {
            method: "POST",
            body: audioBlob,
            headers: { "Content-Type": "application/octet-stream" },
          });

          if (!response.ok) throw new Error("Transcription failed");

          const data = await response.json();
          if (data.text?.trim()) {
            onTranscription(data.text.trim());
          }
        } catch (err) {
          setError("Erreur de transcription. Réessaye.");
          console.error("[Sam Voice] transcription error:", err);
        } finally {
          setVoiceState("idle");
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setVoiceState("recording");
    } catch (err) {
      setError("Impossible d'accéder au micro.");
      console.error("[Sam Voice] mic access error:", err);
      setVoiceState("idle");
    }
  }, [onTranscription]);

  // Start recording — try Web Speech API first, then Whisper
  const startRecording = useCallback(() => {
    setError(null);
    if (voiceState !== "idle") return;

    // Try Web Speech API first (free)
    if (hasWebSpeechAPI) {
      const success = startWebSpeech();
      if (success) return;
    }

    // Fallback to Whisper (supports darija)
    if (hasMediaRecorder) {
      startWhisperRecording();
    } else {
      setError("Ton navigateur ne supporte pas l'enregistrement vocal.");
    }
  }, [voiceState, hasWebSpeechAPI, hasMediaRecorder, startWebSpeech, startWhisperRecording]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  // Play TTS audio for a text
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setVoiceState("speaking");

    try {
      const response = await fetch("/api/sam/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("TTS failed");

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setVoiceState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setVoiceState("idle");
      };

      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      console.error("[Sam Voice] TTS error:", err);
      setVoiceState("idle");
    }
  }, []);

  // Stop playback
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setVoiceState("idle");
  }, []);

  return {
    voiceState,
    error,
    isRecording: voiceState === "recording",
    isTranscribing: voiceState === "transcribing",
    isSpeaking: voiceState === "speaking",
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    hasVoiceSupport: hasWebSpeechAPI || hasMediaRecorder,
  };
}
