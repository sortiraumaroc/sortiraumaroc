/**
 * Sam AI Assistant — Widget principal
 *
 * Combine le bouton flottant et la fenêtre de chat.
 * À placer dans App.tsx, en dehors du Router.
 *
 * Détecte automatiquement si l'utilisateur est sur une page établissement
 * pour activer le mode scoped (assistant dédié à cet établissement).
 */

import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useSam } from "../../hooks/useSam";
import { SamChatButton } from "./SamChatButton";
import { SamChatWindow } from "./SamChatWindow";

// ---------------------------------------------------------------------------
// URL → establishment ref extraction
// ---------------------------------------------------------------------------

/**
 * Extrait le slug/ID d'un établissement depuis le pathname.
 * Supporte les routes localisées : /fr/restaurant/:id, /en/hotel/:id, etc.
 * Retourne null si on n'est pas sur une page établissement.
 */
function extractEstablishmentRef(pathname: string): string | null {
  const match = pathname.match(
    /^(?:\/(?:fr|en|es|ar|de))?\/(?:restaurant|hotel|spa|loisir|culture|shop|rentacar)\/([^/?#]+)/,
  );
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

export function SamWidget() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentUniverse = searchParams.get("universe") || "restaurants";

  // Détecter si on est sur une page établissement
  const establishmentRef = useMemo(
    () => extractEstablishmentRef(location.pathname),
    [location.pathname],
  );

  const {
    isOpen,
    toggle,
    setIsOpen,
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    establishmentId,
  } = useSam(currentUniverse, establishmentRef);

  return (
    <>
      {isOpen && (
        <SamChatWindow
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onClear={clearMessages}
          onClose={() => setIsOpen(false)}
          universe={currentUniverse}
          establishmentId={establishmentId ?? undefined}
        />
      )}
      <SamChatButton isOpen={isOpen} onClick={toggle} />
    </>
  );
}
