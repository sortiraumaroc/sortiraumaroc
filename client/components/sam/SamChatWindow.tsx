/**
 * Fenêtre de chat Sam — composant principal
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { RotateCcw, Sparkles, Volume2, VolumeX } from "lucide-react";
import type { SamMessage } from "../../hooks/useSam";
import { useSamVoice } from "../../hooks/useSamVoice";
import { useUserLocation } from "../../hooks/useUserLocation";
import { SamMessageBubble } from "./SamMessageBubble";
import { SamChatInput } from "./SamChatInput";
import { SAM_CONFIG, getSamUniverseConfig } from "./samClientConfig";
import { SAM_DEFAULT_AVATAR } from "../../lib/samMood";

interface SamChatWindowProps {
  messages: SamMessage[];
  isLoading: boolean;
  onSend: (message: string) => void;
  onClear: () => void;
  onClose: () => void;
  universe?: string | null;
}

export function SamChatWindow({
  messages,
  isLoading,
  onSend,
  onClear,
  onClose,
  universe,
}: SamChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { location: userLocation } = useUserLocation();

  // Universe-specific config
  const universeConfig = useMemo(() => getSamUniverseConfig(universe), [universe]);

  // Voice integration
  const {
    voiceState,
    hasVoiceSupport,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  } = useSamVoice(onSend);

  // Track which message is being spoken
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Voice mode toggle — auto-speak assistant responses
  const [voiceMode, setVoiceMode] = useState(false);
  const lastSpokenIdRef = useRef<string | null>(null);

  // Reset speakingMessageId when voice stops
  useEffect(() => {
    if (voiceState !== "speaking") {
      setSpeakingMessageId(null);
    }
  }, [voiceState]);

  // Auto-speak: when voice mode is on and a new assistant message finishes loading, speak it
  useEffect(() => {
    if (!voiceMode) return;
    if (isLoading) return; // wait for message to finish

    // Find the last assistant message that is done (not loading, not error)
    const lastAssistant = [...messages].reverse().find(
      (m) => m.role === "assistant" && !m.isLoading && !m.isError && m.content,
    );
    if (!lastAssistant) return;
    if (lastAssistant.id === lastSpokenIdRef.current) return; // already spoken

    lastSpokenIdRef.current = lastAssistant.id;
    setSpeakingMessageId(lastAssistant.id);
    speak(lastAssistant.content);
  }, [voiceMode, isLoading, messages, speak]);

  const handleSpeak = useCallback(
    (messageId: string, text: string) => {
      setSpeakingMessageId(messageId);
      speak(text);
    },
    [speak],
  );

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((prev) => {
      if (!prev) {
        // Activating — mark last assistant message as already spoken to avoid replaying it
        const lastAssistant = [...messages].reverse().find(
          (m) => m.role === "assistant" && !m.isLoading && !m.isError && m.content,
        );
        if (lastAssistant) {
          lastSpokenIdRef.current = lastAssistant.id;
        }
      } else {
        // Deactivating — stop any current playback
        stopSpeaking();
      }
      return !prev;
    });
  }, [messages, stopSpeaking]);

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSuggestion = useCallback(
    (text: string) => {
      onSend(text);
    },
    [onSend],
  );

  const isEmpty = messages.length === 0;

  return (
    <div className="fixed bottom-24 end-6 z-50 flex h-[min(600px,calc(100dvh-120px))] w-[min(400px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:bottom-24 sm:end-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-300" />
          <div>
            <h3 className="text-sm font-semibold">{SAM_CONFIG.displayName}</h3>
            <p className="text-[10px] opacity-80">
              {universeConfig.subtitle.fr}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleVoiceMode}
            className={`rounded-lg p-1.5 transition-colors ${
              voiceMode ? "bg-white/30" : "hover:bg-white/20"
            }`}
            aria-label={voiceMode ? "Désactiver le mode vocal" : "Activer le mode vocal"}
            title={voiceMode ? "Mode vocal activé" : "Écouter les réponses de Sam"}
          >
            {voiceMode ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4 opacity-70" />
            )}
          </button>
          {messages.length > 0 && (
            <button
              onClick={onClear}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
              aria-label="Nouvelle conversation"
              title="Nouvelle conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEmpty ? (
          <WelcomeScreen onSuggestion={handleSuggestion} universeConfig={universeConfig} />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <SamMessageBubble
                key={msg.id}
                message={msg}
                userLocation={userLocation}
                onSpeak={(text) => handleSpeak(msg.id, text)}
                onStopSpeaking={stopSpeaking}
                voiceState={voiceState}
                speakingMessageId={speakingMessageId}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <SamChatInput
        onSend={onSend}
        isLoading={isLoading}
        voiceState={voiceState}
        hasVoiceSupport={hasVoiceSupport}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onStopSpeaking={stopSpeaking}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran d'accueil
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  onSuggestion: (text: string) => void;
  universeConfig: ReturnType<typeof getSamUniverseConfig>;
}

function WelcomeScreen({ onSuggestion, universeConfig }: WelcomeScreenProps) {
  const suggestions = universeConfig.suggestions.fr;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="flex items-center justify-center">
        <img src={SAM_DEFAULT_AVATAR} alt="Sam" className="h-20 w-auto" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">
          {universeConfig.welcomeMessage.fr}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Je peux chercher, recommander et r&eacute;server pour toi.
        </p>
      </div>
      <div className="grid w-full gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="w-full rounded-xl border bg-muted/50 px-3 py-2 text-start text-sm transition-colors hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
