import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyToClipboard, downloadDataUrl } from "@/lib/browser-actions";
import { cn } from "@/lib/utils";

import { Copy, Download, ExternalLink } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNumber: number;
  orderStatus?: string | null;
  joinCode?: string | null;
  url: string;
  qrPngDataUrl: string | null;
  className?: string;
};

export function QrTableDialog({
  open,
  onOpenChange,
  tableNumber,
  orderStatus,
  joinCode,
  url,
  qrPngDataUrl,
  className,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[92vw] max-w-[520px] rounded-3xl p-5 md:max-w-[980px] md:p-6",
          className,
        )}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg">QR de la table {tableNumber}</DialogTitle>
          {orderStatus || joinCode ? (
            <DialogDescription className="text-sm">
              {orderStatus ? (
                <>
                  Statut : <span className="font-medium">{orderStatus}</span>
                </>
              ) : null}
              {orderStatus && joinCode ? " • " : null}
              {joinCode ? (
                <>
                  Join code : <span className="font-mono text-xs">{joinCode}</span>
                </>
              ) : null}
            </DialogDescription>
          ) : (
            <DialogDescription className="text-sm">Scannez pour ouvrir la carte.</DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-4 grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-start">
          <div className="rounded-3xl border border-white/10 bg-white p-4">
            {qrPngDataUrl ? (
              <img
                src={qrPngDataUrl}
                alt={`QR code table ${tableNumber}`}
                className="mx-auto aspect-square w-full max-w-[520px]"
              />
            ) : (
              <div className="grid aspect-square w-full place-items-center text-sm text-black/60">Génération…</div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/60">Lien scanné (URL du QR)</div>
              <div className="mt-2 break-all font-mono text-xs text-white/90">{url}</div>
              <div className="mt-3 text-[11px] leading-snug text-white/60">
                Astuce : si le scan affiche “Not Authorized”, le QR pointe sûrement vers une adresse de prévisualisation. Utilisez une URL publique.
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={async () => {
                  await copyToClipboard(url);
                }}
              >
                <Copy className="h-4 w-4" />
                Copier le lien
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={() => {
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Tester (ouvrir)
              </Button>

              <Button
                type="button"
                className="h-11 rounded-2xl bg-sam-red text-white hover:bg-sam-red/90"
                onClick={() => {
                  if (!qrPngDataUrl) return;
                  downloadDataUrl(`table-${tableNumber}-qr.png`, qrPngDataUrl);
                }}
                disabled={!qrPngDataUrl}
              >
                <Download className="h-4 w-4" />
                Télécharger
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
