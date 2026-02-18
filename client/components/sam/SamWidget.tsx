/**
 * Sam AI Assistant — Widget principal
 *
 * Combine le bouton flottant et la fenêtre de chat.
 * À placer dans App.tsx, en dehors du Router.
 */

import { useSearchParams } from "react-router-dom";
import { useSam } from "../../hooks/useSam";
import { SamChatButton } from "./SamChatButton";
import { SamChatWindow } from "./SamChatWindow";

export function SamWidget() {
  const [searchParams] = useSearchParams();
  const currentUniverse = searchParams.get("universe") || "restaurants";

  const {
    isOpen,
    toggle,
    setIsOpen,
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  } = useSam(currentUniverse);

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
        />
      )}
      <SamChatButton isOpen={isOpen} onClick={toggle} />
    </>
  );
}
