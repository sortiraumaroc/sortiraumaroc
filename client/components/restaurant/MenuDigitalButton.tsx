/**
 * MenuDigitalButton Component
 *
 * Displays a button to access the digital menu (QR code menu)
 * when the establishment has menu digital enabled.
 */

import { QrCode, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  menuUrl: string;
  className?: string;
};

export function MenuDigitalButton({ menuUrl, className }: Props) {
  return (
    <Button
      asChild
      variant="outline"
      className={`gap-2 border-primary/30 text-primary hover:bg-primary/5 ${className ?? ""}`}
    >
      <a href={menuUrl} target="_blank" rel="noopener noreferrer">
        <QrCode className="w-4 h-4" />
        <span>Voir le Menu</span>
        <ExternalLink className="w-3 h-3 opacity-50" />
      </a>
    </Button>
  );
}
