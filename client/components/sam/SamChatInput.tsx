/**
 * Zone de saisie du chat Sam — avec bouton micro
 */

import { useState, useRef, useCallback } from "react";
import { SendHorizonal } from "lucide-react";
import { SamVoiceButton } from "./SamVoiceButton";
import type { VoiceState } from "../../hooks/useSamVoice";

interface SamChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  voiceState?: VoiceState;
  hasVoiceSupport?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onStopSpeaking?: () => void;
}

export function SamChatInput({
  onSend,
  isLoading,
  placeholder = "Écris ton message...",
  voiceState = "idle",
  hasVoiceSupport = false,
  onStartRecording,
  onStopRecording,
  onStopSpeaking,
}: SamChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    // Re-focus après envoi
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [value, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex items-end gap-2 border-t bg-background p-3">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border bg-muted/50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
        disabled={isLoading}
      />
      {hasVoiceSupport && onStartRecording && onStopRecording && onStopSpeaking && (
        <SamVoiceButton
          voiceState={voiceState}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          onStopSpeaking={onStopSpeaking}
          disabled={isLoading}
        />
      )}
      <button
        onClick={handleSend}
        disabled={!value.trim() || isLoading}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-all hover:bg-primary/90 disabled:opacity-40"
        aria-label="Envoyer"
      >
        <SendHorizonal className="h-4 w-4" />
      </button>
    </div>
  );
}
