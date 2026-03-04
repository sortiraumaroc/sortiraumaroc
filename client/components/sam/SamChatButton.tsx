/**
 * Bouton flottant pour ouvrir le chat Sam
 */

import { X } from "lucide-react";
import { SAM_CONFIG } from "./samClientConfig";

interface SamChatButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function SamChatButton({ isOpen, onClick }: SamChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95"
      aria-label={isOpen ? "Fermer Sam" : "Ouvrir Sam, votre concierge IA"}
      title={SAM_CONFIG.displayName}
    >
      {isOpen ? (
        <X className="h-6 w-6 text-gray-600" />
      ) : (
        <img src="/sam-avatar.png" alt="Sam" className="h-6 w-6 rounded-full object-cover" />
      )}
    </button>
  );
}
