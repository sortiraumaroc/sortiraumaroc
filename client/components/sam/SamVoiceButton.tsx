/**
 * Bouton micro pour le chat Sam
 *
 * Pulse animation pendant l'enregistrement.
 * États : idle (mic icon), recording (pulse red), transcribing (spinner), speaking (speaker icon)
 */

import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import type { VoiceState } from "../../hooks/useSamVoice";

interface SamVoiceButtonProps {
  voiceState: VoiceState;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStopSpeaking: () => void;
  disabled?: boolean;
}

export function SamVoiceButton({
  voiceState,
  onStartRecording,
  onStopRecording,
  onStopSpeaking,
  disabled,
}: SamVoiceButtonProps) {
  const handleClick = () => {
    switch (voiceState) {
      case "idle":
        onStartRecording();
        break;
      case "recording":
        onStopRecording();
        break;
      case "speaking":
        onStopSpeaking();
        break;
      default:
        break; // transcribing — no action
    }
  };

  const getIcon = () => {
    switch (voiceState) {
      case "recording":
        return <MicOff className="h-4 w-4" />;
      case "transcribing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "speaking":
        return <Volume2 className="h-4 w-4" />;
      default:
        return <Mic className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    switch (voiceState) {
      case "recording":
        return "Arrêter";
      case "transcribing":
        return "Transcription...";
      case "speaking":
        return "Arrêter la lecture";
      default:
        return "Parler";
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || voiceState === "transcribing"}
      aria-label={getLabel()}
      title={getLabel()}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
        voiceState === "recording"
          ? "animate-pulse bg-red-500 text-white"
          : voiceState === "speaking"
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
      } disabled:opacity-40`}
    >
      {getIcon()}
    </button>
  );
}
