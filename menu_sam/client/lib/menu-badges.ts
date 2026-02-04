import type { MenuBadge } from "@/lib/menu-data";

export type BadgeMeta = {
  label: string;
  className: string;
};

export function getBadgeMeta(badge: MenuBadge | string): BadgeMeta {
  switch (badge) {
    case "specialite":
      return {
        label: "Spécialité ⭐",
        className:
          "bg-sam-yellow/25 text-foreground border border-sam-yellow/30",
      };
    case "nouveau":
      return {
        label: "Nouveau 🆕",
        className: "bg-secondary text-foreground border border-border",
      };
    case "bestSeller":
    case "best-seller":
      return {
        label: "Best seller 🔥",
        className: "bg-primary/10 text-primary border border-primary/20",
      };
    case "coupDeCoeur":
    case "coup-de-coeur":
      return {
        label: "Coup de ❤️",
        className: "bg-primary/5 text-primary border border-primary/15",
      };
    case "chef":
    case "suggestion-chef":
      return {
        label: "Suggestion du chef 👨‍🍳",
        className: "bg-secondary text-foreground border border-border",
      };
    case "vegetarien":
      return {
        label: "Végétarien 🌿",
        className:
          "bg-sam-success/15 text-foreground border border-sam-success/25",
      };
    case "epice":
      return {
        label: "Épicé 🌶",
        className: "bg-primary/10 text-primary border border-primary/20",
      };
    case "fruitsDeMer":
    case "fruits-mer":
      return {
        label: "Fruits de mer 🐟",
        className: "bg-secondary text-foreground border border-border",
      };
    case "healthy":
      return {
        label: "Healthy 🥗",
        className:
          "bg-sam-success/15 text-foreground border border-sam-success/25",
      };
    case "traditionnel":
      return {
        label: "Traditionnel 🇲🇦",
        className: "bg-secondary text-foreground border border-border",
      };
    case "signature":
      return {
        label: "Signature 🇲🇦",
        className:
          "bg-sam-yellow/25 text-foreground border border-sam-yellow/30",
      };
    // Default case for unknown badges
    default:
      return {
        label: String(badge).charAt(0).toUpperCase() + String(badge).slice(1),
        className: "bg-secondary text-foreground border border-border",
      };
  }
}
