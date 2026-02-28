/**
 * Sam AI Assistant — Widget pour l'espace professionnel
 *
 * Assistant dédié aux pros pour les guider sur le fonctionnement de sam.ma.
 * Utilise le mode "pro" qui active un system prompt spécifique.
 */

import { useSam } from "../../hooks/useSam";
import { SamChatButton } from "../sam/SamChatButton";
import { SamChatWindow } from "../sam/SamChatWindow";

export function ProSamWidget() {
  const {
    isOpen,
    toggle,
    setIsOpen,
    messages,
    isLoading,
    sendMessage,
    clearMessages,
  } = useSam(undefined, undefined, "pro");

  return (
    <>
      {isOpen && (
        <SamChatWindow
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onClear={clearMessages}
          onClose={() => setIsOpen(false)}
        />
      )}
      <SamChatButton isOpen={isOpen} onClick={toggle} />
    </>
  );
}
