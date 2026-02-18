/**
 * Bulle de message dans le chat Sam
 */

import { useMemo } from "react";
import type { SamMessage } from "../../hooks/useSam";
import { SamEstablishmentCard } from "./SamEstablishmentCard";
import type { SamEstablishmentItem } from "../../lib/samApi";
import type { LatLng } from "../../lib/geo";
import { SamTypingIndicator } from "./SamTypingIndicator";
import { AlertCircle, Volume2, Loader2, VolumeX } from "lucide-react";
import { SAM_AVATARS, SAM_DEFAULT_AVATAR, type SamMood } from "../../lib/samMood";
import type { VoiceState } from "../../hooks/useSamVoice";

interface SamMessageBubbleProps {
  message: SamMessage;
  userLocation?: LatLng | null;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
  voiceState?: VoiceState;
  speakingMessageId?: string | null;
}

// ---------------------------------------------------------------------------
// Rendu markdown léger pour les messages de Sam
// Gère : **bold**, *italic*, liens [text](url), listes (- / •), retours à la ligne
// Supprime : images ![...](url), URLs brutes longues
// ---------------------------------------------------------------------------

function cleanAndRenderMarkdown(text: string, hasEstablishments?: boolean): JSX.Element {
  // Supprimer les images markdown ![alt](url)
  let cleaned = text.replace(/!\[.*?\]\(.*?\)/g, "").trim();

  // Supprimer les URLs brutes longues (https://...supabase.co/... etc.)
  cleaned = cleaned.replace(/https?:\/\/\S{60,}/g, "").trim();

  // Si des cartes d'établissements sont présentes, supprimer les listes
  // (GPT a tendance à lister les noms malgré le system prompt)
  if (hasEstablishments) {
    // Supprimer les lignes qui sont des items de liste (- item, • item, 1. item, 1) item)
    cleaned = cleaned
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        // Garder les lignes vides et les lignes qui ne sont PAS des items de liste
        if (!trimmed) return true;
        if (/^\s*[-•*]\s/.test(trimmed)) return false;
        if (/^\s*\d+[.)]\s/.test(trimmed)) return false;
        return true;
      })
      .join("\n");

    // Supprimer aussi les lignes qui ressemblent à des descriptions d'établissements
    // (ex: "**Nom du resto** — cuisine italienne, note 4.5")
    cleaned = cleaned
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        // Ligne contenant **bold** suivi de tiret/dash et description = listing d'établissement
        if (/^\*\*.+\*\*\s*[—–\-:].+/.test(trimmed)) return false;
        return true;
      })
      .join("\n");
  }

  // Supprimer les lignes vides multiples
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  // Si vide après nettoyage
  if (!cleaned) return <span />;

  // Découper en paragraphes
  const paragraphs = cleaned.split(/\n\n+/);

  return (
    <>
      {paragraphs.map((para, pIdx) => {
        const lines = para.split("\n");

        // Détecter si c'est une liste
        const isList = lines.every(
          (l) => /^\s*[-•*]\s/.test(l) || /^\s*\d+[.)]\s/.test(l) || !l.trim(),
        );

        if (isList) {
          return (
            <ul key={pIdx} className="ms-1 list-inside list-disc space-y-0.5">
              {lines
                .filter((l) => l.trim())
                .map((line, lIdx) => (
                  <li key={lIdx} className="text-sm leading-relaxed">
                    {renderInline(line.replace(/^\s*[-•*]\s*/, "").replace(/^\s*\d+[.)]\s*/, ""))}
                  </li>
                ))}
            </ul>
          );
        }

        return (
          <p key={pIdx} className="text-sm leading-relaxed">
            {lines.map((line, lIdx) => (
              <span key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

/** Rendu inline : **bold**, *italic*, `code`, [link](url) */
function renderInline(text: string): JSX.Element {
  // Pattern pour trouver les éléments inline
  const parts: JSX.Element[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining) {
    // **bold**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // *italic*
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
    // [link](url)
    const linkMatch = remaining.match(/\[([^\]]+?)\]\((https?:\/\/[^)]+)\)/);

    // Trouver le match le plus proche
    const matches = [
      boldMatch && { type: "bold", match: boldMatch },
      italicMatch && { type: "italic", match: italicMatch },
      linkMatch && { type: "link", match: linkMatch },
    ].filter(Boolean) as Array<{ type: string; match: RegExpMatchArray }>;

    if (!matches.length) {
      parts.push(<span key={keyIdx++}>{remaining}</span>);
      break;
    }

    // Trier par position
    matches.sort(
      (a, b) => (a.match.index ?? Infinity) - (b.match.index ?? Infinity),
    );
    const first = matches[0];
    const idx = first.match.index ?? 0;

    // Texte avant le match
    if (idx > 0) {
      parts.push(<span key={keyIdx++}>{remaining.slice(0, idx)}</span>);
    }

    switch (first.type) {
      case "bold":
        parts.push(
          <strong key={keyIdx++} className="font-semibold">
            {first.match[1]}
          </strong>,
        );
        remaining = remaining.slice(idx + first.match[0].length);
        break;
      case "italic":
        parts.push(<em key={keyIdx++}>{first.match[1]}</em>);
        remaining = remaining.slice(idx + first.match[0].length);
        break;
      case "link":
        parts.push(
          <a
            key={keyIdx++}
            href={first.match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {first.match[1]}
          </a>,
        );
        remaining = remaining.slice(idx + first.match[0].length);
        break;
    }
  }

  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function SamMessageBubble({ message, userLocation, onSpeak, onStopSpeaking, voiceState, speakingMessageId }: SamMessageBubbleProps) {
  const isUser = message.role === "user";
  const isSpeakingThis = voiceState === "speaking" && speakingMessageId === message.id;

  // Avatar de Sam basé sur le mood du message
  const avatarSrc = !isUser
    ? SAM_AVATARS[(message.mood as SamMood)] ?? SAM_DEFAULT_AVATAR
    : null;

  const hasEstablishments = (message.establishments?.length ?? 0) > 0;

  // Rendu markdown mémorisé pour les messages assistant
  const renderedContent = useMemo(() => {
    if (isUser || !message.content) return null;
    return cleanAndRenderMarkdown(message.content, hasEstablishments);
  }, [isUser, message.content, hasEstablishments]);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Avatar Sam à gauche des messages assistant */}
      {!isUser && (
        <div className="me-2 mt-1 shrink-0">
          <div className="flex h-8 w-8 items-end justify-center overflow-hidden rounded-full bg-muted">
            <img
              src={avatarSrc!}
              alt="Sam"
              className="h-9 w-auto"
            />
          </div>
        </div>
      )}

      <div
        className={`max-w-[80%] space-y-2 ${
          isUser
            ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-white"
            : "space-y-2"
        }`}
      >
        {/* Texte du message */}
        {message.isLoading && !message.content ? (
          <SamTypingIndicator />
        ) : message.isError ? (
          <div className="flex items-start gap-2 rounded-2xl rounded-bl-md bg-destructive/10 px-4 py-2.5 text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">{message.content}</p>
          </div>
        ) : !isUser && message.content ? (
          <div className="group relative rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 space-y-1.5">
            {renderedContent}
            {/* Bouton écouter le message */}
            {onSpeak && !message.isLoading && (
              <button
                type="button"
                onClick={() => {
                  if (isSpeakingThis) {
                    onStopSpeaking?.();
                  } else {
                    onSpeak(message.content!);
                  }
                }}
                disabled={voiceState === "speaking" && !isSpeakingThis}
                className={`absolute -bottom-3 end-2 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm transition-all ${
                  isSpeakingThis
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:border-primary"
                } disabled:opacity-30`}
                aria-label={isSpeakingThis ? "Arrêter la lecture" : "Écouter"}
                title={isSpeakingThis ? "Arrêter la lecture" : "Écouter"}
              >
                {isSpeakingThis ? (
                  <VolumeX className="h-3 w-3" />
                ) : (
                  <Volume2 className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        ) : isUser ? (
          <p className="text-sm leading-relaxed">{message.content}</p>
        ) : null}

        {/* Carrousel d'établissements */}
        {message.establishments && message.establishments.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {message.establishments
              .filter((est): est is SamEstablishmentItem => est != null && est.id != null)
              .map((est) => (
                <SamEstablishmentCard key={est.id} item={est} userLocation={userLocation} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
